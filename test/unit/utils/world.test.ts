import { expect, config } from 'chai'

import { World } from '../../../src/utils/world'
import { Game } from '../mock'

config.showDiff = true
config.truncateThreshold = 0

type ExitDescriptions = Map<string, ExitsInformation>
const createExitDescriptions = (): ExitDescriptions => {
    const exitDescriptions = new Map<string, ExitsInformation>()
    for (let w = 0; w <= 10; w++) {
        for (let n = 0; n <= 10; n++) {
            const roomName = `W${w}N${n}`
            const exits: ExitsInformation = {}
            if (n < 10) exits['1'] = `W${w}N${n + 1}`
            if (n > 0) exits['5'] = `W${w}N${n - 1}`
            if (w > 0) exits['3'] = `W${w - 1}N${n}`
            if (w < 10) exits['7'] = `W${w + 1}N${n}`
            exitDescriptions.set(roomName, exits)
        }
    }
    return exitDescriptions
}

const describeExitsFn =
    (exitDescriptions: ExitDescriptions) =>
    (roomName: string): ExitsInformation => {
        return exitDescriptions.get(roomName) || {}
    }

describe('World', () => {
    let exitDescriptions: ExitDescriptions
    beforeEach(() => {
        exitDescriptions = createExitDescriptions()
    })
    describe('#getClosestRooms', () => {
        it('should return an empty array when given an empty roomNames array', () => {
            const roomNames: string[] = []
            const maxDistance = 5
            const world = new World(describeExitsFn(exitDescriptions))
            const result = world.getClosestRooms(roomNames, maxDistance)
            expect(result).to.deep.equal([])
        })

        it('should return the closest rooms within the maxDistance', () => {
            const roomNames = ['W5N8']
            delete exitDescriptions.get('W5N8')!['1']
            delete exitDescriptions.get('W5N8')!['3']
            delete exitDescriptions.get('W5N8')!['5']
            delete exitDescriptions.get('W6N8')!['1']
            delete exitDescriptions.get('W6N8')!['5']
            delete exitDescriptions.get('W7N8')!['1']
            delete exitDescriptions.get('W7N8')!['5']
            const maxDistance = 2
            const world = new World(describeExitsFn(exitDescriptions))
            const result = world.getClosestRooms(roomNames, maxDistance)
            expect(result).to.deep.include({ roomName: 'W6N8', distance: 1 })
            expect(result).to.deep.include({ roomName: 'W7N8', distance: 2 })
        })
    })

    describe('#findBestOwnedRoom', () => {
        beforeEach(() => {
            global.Game = Game
        })

        it('should return null when there are no owned rooms', () => {
            const world = new World(describeExitsFn(exitDescriptions))
            const result = world.findBestOwnedRoom('W5N5', 5, new Map())
            expect(result).to.be.null
        })

        it('should return the closest owned room within the maxDistance', () => {
            const ownedRoomProgress = new Map<string, number>([
                ['W5N8', 1],
                ['W6N8', 1],
                ['W7N8', 1],
            ])
            const world = new World(describeExitsFn(exitDescriptions))
            const result = world.findBestOwnedRoom('W4N8', 2, ownedRoomProgress)
            expect(result).to.equal('W5N8')
        })

        it('should return the room with the highest controller level when there are multiple candidates', () => {
            const ownedRoomProgress = new Map<string, number>([
                ['W5N8', 1],
                ['W3N8', 2],
                ['W4N7', 1],
                ['W4N9', 1],
            ])
            const world = new World(describeExitsFn(exitDescriptions))
            const result = world.findBestOwnedRoom('W4N8', 2, ownedRoomProgress)
            expect(result).to.equal('W3N8')
        })
    })
})
