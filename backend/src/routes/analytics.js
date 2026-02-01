import express from 'express'
import { Tracker } from '../models/Tracker.js'
import { Event } from '../models/Event.js'
import { Site } from '../models/Site.js'

const router = express.Router()

// GET /analytics/top-trackers
router.get('/top-trackers', async (req, res) => {
  try {
    const trackers = await Tracker.find()
      .sort({ sightingCount: -1 })
      .limit(10)
      .select('domain category risk sightingCount')
      .lean()

    res.json({
      success: true,
      data: trackers.map((tracker) => ({
        name: tracker.domain,
        count: tracker.sightingCount,
        category: tracker.category,
        risk: tracker.risk,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch top trackers' })
  }
})

// GET /analytics/trends
router.get('/trends', async (req, res) => {
  try {
    // Get aggregated trends
    const trends = await Event.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ])

    res.json({
      success: true,
      data: trends.map((trend) => ({
        date: trend._id,
        events: trend.count,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trends' })
  }
})

// GET /analytics/network
router.get('/network', async (req, res) => {
  try {
    const sites = await Site.find().limit(20).select('domain trackerCount').lean()
    const trackers = await Tracker.find().limit(20).select('domain sightingCount').lean()

    const nodes = [
      ...sites.map((site) => ({
        id: site.domain,
        label: site.domain,
        type: 'site',
        value: site.trackerCount,
      })),
      ...trackers.map((tracker) => ({
        id: tracker.domain,
        label: tracker.domain,
        type: 'tracker',
        value: tracker.sightingCount,
      })),
    ]

    const edges = []
    const events = await Event.find().limit(100)
    events.forEach((evt) => {
      edges.push({
        source: evt.domain,
        target: evt.trackerDomain,
        weight: 1,
      })
    })

    res.json({
      success: true,
      data: {
        nodes,
        edges,
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch network data' })
  }
})

// GET /analytics/summary
router.get('/summary', async (req, res) => {
  try {
    const totalSites = await Site.countDocuments()
    const totalTrackers = await Tracker.countDocuments()
    const totalEvents = await Event.countDocuments()

    const avgScore = await Site.aggregate([
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
        },
      },
    ])

    res.json({
      success: true,
      data: {
        totalSites,
        totalTrackers,
        totalEvents,
        averageRiskScore: avgScore[0]?.avgScore || 0,
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics summary' })
  }
})

export default router

// 🔥 KILLER FEATURE: GET /analytics/recent-changes
// Shows behavioral changes across ALL sites - for investigators
router.get('/recent-changes', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    // Find all sites with recent score history changes
    const sites = await Site.find({
      'scoreHistory.date': { $gte: cutoffDate },
    })

    const allChanges = []

    sites.forEach((site) => {
      const recentSnapshots = site.scoreHistory.filter(
        (snapshot) =>
          new Date(snapshot.date) >= cutoffDate &&
          snapshot.changeReason !== 'periodic_snapshot' &&
          (snapshot.trackersAdded.length > 0 || snapshot.trackersRemoved.length > 0)
      )

      recentSnapshots.forEach((snapshot) => {
        allChanges.push({
          domain: site.domain,
          date: snapshot.date,
          description: snapshot.changeDescription,
          reason: snapshot.changeReason,
          trackersAdded: snapshot.trackersAdded,
          trackersRemoved: snapshot.trackersRemoved,
          score: snapshot.score,
        })
      })
    })

    // Sort by date descending
    allChanges.sort((a, b) => new Date(b.date) - new Date(a.date))

    res.json({
      success: true,
      data: {
        timeframe: `Last ${days} days`,
        changeCount: allChanges.length,
        changes: allChanges.slice(0, 50), // Limit to 50 most recent
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recent changes' })
  }
})
