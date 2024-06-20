import * as Logger from 'utils/logger'
import SourceManager from './source-manager'
import { getHarvesters } from 'utils/creep'
import { profile } from 'utils/profiling'
import roleHarvester from 'roles/harvester'

export default class SourcesManager {
    private room: Room
    private sourceManagers: SourceManager[]

    constructor(room: Room) {
        this.room = room
        this.sourceManagers = []

        // Initialize sourceManagers array with SourceManager instances
        const sources = this.room.find(FIND_SOURCES)
        for (const source of sources) {
            const sourceManager = SourceManager.createFromSource(source)
            this.sourceManagers.push(sourceManager)
        }
    }

    public hasEnoughHarvesters(): boolean {
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasEnoughHarvesters()) {
                Logger.info(
                    'sources-manager:hasEnoughHarvesters:notEnoughHarvesters',
                    this.room.name,
                    sourceManager.id,
                )
                return false
            }
        }
        return true
    }

    public hasEnoughAuxHarvesters(): boolean {
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasEnoughAuxHarvesters()) {
                return false
            }
        }
        return true
    }

    public hasAllContainerHarvesters(): boolean {
        return this.sourceManagers.every((sourceManager) => sourceManager.hasStaticHarvester())
    }

    public getNextHarvesterMiningTarget(): {
        source: Id<Source>
        pos: RoomPosition
    } | null {
        let source: Id<Source> | null = null
        let pos: RoomPosition | null = null
        for (const sourceManager of this.sourceManagers) {
            if (!sourceManager.hasStaticHarvester()) {
                pos = sourceManager.containerPosition
                source = sourceManager.id
            }
        }
        if (pos && source) {
            return { source, pos }
        }
        for (const sourceManager of this.sourceManagers) {
            const position = sourceManager.getNextAvailableHarvesterPosition()
            if (position !== null) {
                pos = position
                source = sourceManager.id
                break
            }
        }
        if (pos && source) {
            if (this.verifyPositionAvailable(pos, source)) {
                return { source, pos }
            } else {
                Logger.error(`position ${pos}/${source} is not available for a new harvester}`)
            }
        }
        return null
    }

    @profile
    public getNextAuxHarvesterMiningTarget(): {
        source: Id<Source>
        pos: RoomPosition
    } | null {
        let source: Id<Source> | null = null
        let pos: RoomPosition | null = null
        for (const sourceManager of this.sourceManagers) {
            const position = sourceManager.getNextAvailableAuxHarvestPosition()
            if (position !== null) {
                pos = position
                source = sourceManager.id
                break
            }
        }
        if (pos && source) {
            return { source, pos }
        }
        return null
    }

    public createHarvester(spawn: StructureSpawn, rescue = false): number {
        const target = this.getNextHarvesterMiningTarget()
        if (!target) {
            throw new Error('no available positions for harvester')
        }
        const { pos, source } = target
        const sourceManager = SourceManager.getById(source)
        return roleHarvester.create(spawn, sourceManager.id, pos, rescue)
    }

    private verifyPositionAvailable(pos: RoomPosition, source: Id<Source>): boolean {
        const harvesters = getHarvesters(this.room)
        for (const harvester of harvesters) {
            if (
                harvester.memory.source === source &&
                harvester.memory.pos.x === pos.x &&
                harvester.memory.pos.y === pos.y
            ) {
                return false
            }
        }
        return true
    }
}
