import { Game } from '../mock'
global.Game = Game

import { stub } from 'sinon'
import { expect } from 'chai'

import { DistanceTTL, ScoutManager } from '../../../src/managers/scout-manager'

describe('ScoutManager', () => {
    describe.skip('findNextRoomToScout', () => {
        it('should return null if getClosestRooms returns an empty array', () => {
            const world = { getClosestRooms: stub() }
            world.getClosestRooms.returns([])
            // Mock the scout room data
            const scoutManager = new ScoutManager(world as any, new Map(), {}, {}, 100)
            const nextRoomToScout = scoutManager.findNextRoomToScout()
            expect(nextRoomToScout).to.be.null
        })

        it('should return the closest room', () => {
            const ownedRoomProgress = new Map()
            ownedRoomProgress.set('W5N8', 0)
            ownedRoomProgress.set('W3N8', 0)
            const world = { getClosestRooms: stub() }
            world.getClosestRooms.returns([
                { roomName: 'W5N8', distance: 1 },
                { roomName: 'W3N8', distance: 2 },
            ])

            const scoutManager = new ScoutManager(world as any, ownedRoomProgress, {}, {}, 100)
            const nextRoomToScout = scoutManager.findNextRoomToScout()
            expect(nextRoomToScout).to.equal('W5N8')
        })

        it('should return the room that has not been scouted', () => {
            const ownedRoomProgress = new Map()
            ownedRoomProgress.set('W5N8', 0)
            ownedRoomProgress.set('W3N8', 0)
            const world = { getClosestRooms: stub() }
            let scoutRoomData = {
                W5N8: { updatedAt: 1 },
            }
            const featureRoomData = {
                W5N8: true,
                W3N8: true,
            }
            world.getClosestRooms.returns([
                { roomName: 'W5N8', distance: 1 },
                { roomName: 'W3N8', distance: 2 },
            ])
            const scoutManager = new ScoutManager(
                world as any,
                ownedRoomProgress,
                scoutRoomData as any,
                featureRoomData as any,
                2,
            )
            const nextRoomToScout = scoutManager.findNextRoomToScout()
            expect(nextRoomToScout).to.equal('W3N8')
        })

        it('should return the room that has no features', () => {
            const ownedRoomProgress = new Map()
            ownedRoomProgress.set('W5N8', 0)
            ownedRoomProgress.set('W3N8', 0)
            const world = { getClosestRooms: stub() }
            let scoutRoomData = {
                W5N8: { updatedAt: 1 },
                W3N8: { updatedAt: 1 },
            }
            const featureRoomData = {
                W5N8: true,
                W3N8: false,
            }
            world.getClosestRooms.returns([
                { roomName: 'W5N8', distance: 1 },
                { roomName: 'W3N8', distance: 2 },
            ])
            const scoutManager = new ScoutManager(
                world as any,
                ownedRoomProgress,
                scoutRoomData as any,
                featureRoomData as any,
                2,
            )
            const nextRoomToScout = scoutManager.findNextRoomToScout()
            expect(nextRoomToScout).to.equal('W3N8')
        })

        it('should return the room that has expired their ttl', () => {
            const ownedRoomProgress = new Map()
            ownedRoomProgress.set('W5N8', 0)
            ownedRoomProgress.set('W3N8', 0)
            const world = { getClosestRooms: stub() }
            let scoutRoomData = {
                W5N8: { updatedAt: DistanceTTL[1] },
                W3N8: { updatedAt: 0 }, // should be passed ttl
            }
            let featureRoomData = {
                W5N8: true,
                W3N8: true,
            }
            world.getClosestRooms.returns([
                { roomName: 'W5N8', distance: 1 },
                { roomName: 'W3N8', distance: 2 },
            ])
            const scoutManager = new ScoutManager(
                world as any,
                ownedRoomProgress,
                scoutRoomData as any,
                featureRoomData as any,
                DistanceTTL[2] + 1,
            )
            const nextRoomToScout = scoutManager.findNextRoomToScout()
            expect(nextRoomToScout).to.equal('W3N8')
        })
    })
})
