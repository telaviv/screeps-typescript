import { expect } from 'chai'
import { stub, SinonStub } from 'sinon'
import RoleLogistics, { calculateParts } from '../../../src/roles/logistics'
import { LogisticsCreep } from '../../../src/roles/logistics-constants'
import { getBuildManager } from '../../../src/managers/build-manager'
import { filter } from 'lodash'

describe('logistics', () => {
    describe('calculateParts()', () => {
        it('produces the correct amount of parts', () => {
            const checks = [
                { capacity: 300, work: 1, carry: 1, move: 2 },
                { capacity: 350, work: 1, carry: 1, move: 2 },
                { capacity: 400, work: 1, carry: 1, move: 2 },
                { capacity: 450, work: 1, carry: 1, move: 2 },
                { capacity: 500, work: 2, carry: 2, move: 4 },
                { capacity: 550, work: 2, carry: 2, move: 4 },
                { capacity: 600, work: 2, carry: 2, move: 4 },
            ]

            for (const { capacity, work, move, carry } of checks) {
                const parts = calculateParts(capacity)
                const works = filter(parts, (p) => p === WORK)
                const moves = filter(parts, (p) => p === MOVE)
                const carrys = filter(parts, (p) => p === CARRY)
                expect(works.length).to.equal(work)
                expect(moves.length).to.equal(move)
                expect(carrys.length).to.equal(carry)
            }
        })
    })

    describe('RoleLogistics', () => {
        let creep: LogisticsCreep & { upgradeController: SinonStub }
        let buildManager: { hasNonWallConstructionSites: SinonStub }
        let room: any

        beforeEach(() => {
            room = {
                name: 'test',
                controller: {
                    ticksToDowngrade: 10000
                },
                find: stub().returns([])
            }

            creep = {
                name: 'test-creep',
                room,
                memory: {
                    role: 'logistics',
                    home: 'test',
                    preference: 'worker',
                    currentTask: 'upgrading',
                    tasks: [],
                    idleTimestamp: null
                },
                store: {
                    getUsedCapacity: () => 50,
                    getCapacity: () => 100
                },
                upgradeController: stub().returns(OK),
                say: stub()
            } as unknown as LogisticsCreep & { upgradeController: SinonStub }

            buildManager = {
                hasNonWallConstructionSites: stub()
            }

            global.Game = {
                rooms: { test: room },
                cpu: {
                    getUsed: () => 0
                }
            } as unknown as Game
        })

        describe('upgrade behavior', () => {
            beforeEach(() => {
                ;(getBuildManager as any) = stub().returns(buildManager)
            })

            it('should interrupt upgrading when construction sites exist', () => {
                // Setup
                buildManager.hasNonWallConstructionSites.returns(true)

                // Execute
                const logistics = new RoleLogistics(creep)
                logistics.upgrade()

                // Verify
                expect(buildManager.hasNonWallConstructionSites.called).to.be.true
                expect(creep.memory.currentTask).to.equal('building')
                expect(creep.upgradeController.called).to.be.false
            })

            it('should continue upgrading when no construction sites exist', () => {
                // Setup
                buildManager.hasNonWallConstructionSites.returns(false)

                // Execute
                const logistics = new RoleLogistics(creep)
                logistics.upgrade()

                // Verify
                expect(buildManager.hasNonWallConstructionSites.called).to.be.true
                expect(creep.upgradeController.called).to.be.true
            })

            it('should not check construction sites if controller is missing', () => {
                // Setup
                room.controller = null
                buildManager.hasNonWallConstructionSites.returns(true)

                // Execute
                const logistics = new RoleLogistics(creep)
                logistics.upgrade()

                // Verify
                expect(buildManager.hasNonWallConstructionSites.called).to.be.false
                expect(creep.upgradeController.called).to.be.false
            })
        })

        describe('task prioritization', () => {
            beforeEach(() => {
                ;(getBuildManager as any) = stub().returns(buildManager)
            })

            it('should prioritize building when spawn is missing', () => {
                // Setup
                const roomUtils = require('../../../src/utils/room')
                ;(roomUtils.hasNoSpawns as any) = stub().returns(true)
                buildManager.hasNonWallConstructionSites.returns(false)

                // Execute
                const logistics = new RoleLogistics(creep)
                logistics['assignWorkerPreference']()

                // Verify
                expect(creep.memory.currentTask).to.equal('building')
            })
        })
    })
})
