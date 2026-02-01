import express from 'express'
import { Tracker } from '../models/Tracker.js'
import { Event } from '../models/Event.js'

const router = express.Router()

// GET /trackers
router.get('/', async (req, res) => {
  try {
    const trackers = await Tracker.find()
      .sort({ sightingCount: -1 })
      .limit(100)
      .select('domain category type risk sightingCount firstSeen')
      .lean()

    res.json({
      success: true,
      data: trackers.map((tracker) => ({
        domain: tracker.domain,
        category: tracker.category,
        type: tracker.type,
        risk: tracker.risk,
        sightingCount: tracker.sightingCount,
        firstSeen: tracker.firstSeen,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trackers' })
  }
})

// GET /trackers/domain/:domain
router.get('/domain/:domain', async (req, res) => {
  try {
    const { domain } = req.params
    const events = await Event.find({ trackerDomain: domain.toLowerCase() })
      .limit(50)
      .sort({ createdAt: -1 })

    const tracker = await Tracker.findOne({ domain: domain.toLowerCase() })

    res.json({
      success: true,
      data: {
        tracker,
        events: events.map((evt) => ({
          domain: evt.domain,
          trackerType: evt.trackerType,
          category: evt.category,
          detectedAt: evt.createdAt,
        })),
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tracker details' })
  }
})

export default router
