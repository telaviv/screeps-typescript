import { stub } from 'sinon'
import { expect } from 'chai'

import { ScoutManager } from '../../../src/managers/scout-manager'
import { get } from 'lodash'

describe('ScoutManager', () => {
    describe('findNextRoomToScout', () => {
        it('should return null if getClosestRooms returns an empty array', () => {
            const world = { getClosestRooms: stub() }
            world.getClosestRooms.returns([])
            // Mock the scout room data
            const scoutManager = new ScoutManager(world as any, new Map(), {})
            const nextRoomToScout = scoutManager.findNextRoomToScout()
            expect(nextRoomToScout).to.be.null
        })

        it('should return the room closest room', () => {
            const ownedRoomProgress = new Map()
            ownedRoomProgress.set('W5N8', 0)
            ownedRoomProgress.set('W3N8', 0)
            const world = {getClosestRooms: stub()}
            world.getClosestRooms.returns([{roomName: 'W5N8', distance: 1}, {roomName: 'W3N8', distance: 2}])

            const scoutManager = new ScoutManager(world as any, ownedRoomProgress, {})
            const nextRoomToScout = scoutManager.findNextRoomToScout()
            expect(nextRoomToScout).to.equal('W5N8')
        })
    })
})
