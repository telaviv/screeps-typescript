import { stub } from 'sinon'
import { expect } from 'chai'

import { ScoutManager } from '../../../src/managers/scout-manager'

describe('ScoutManager', () => {
    describe('findNextRoomToScout', () => {
        it.only('should return null if getClosestRooms returns an empty array', () => {
            const world = { getClosestRooms: stub() }
            world.getClosestRooms.returns([])
            // Mock the scout room data
            const scoutManager = new ScoutManager(world as any, new Map(), {})
            const nextRoomToScout = scoutManager.findNextRoomToScout()
            expect(nextRoomToScout).to.be.null
        })
    })
})
