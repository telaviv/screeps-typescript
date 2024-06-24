import { expect, config } from 'chai'

import { getClosestRooms } from '../../../src/utils/world'

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

describe('getClosestRooms', () => {
    let exitDescriptions: ExitDescriptions
    beforeEach(() => {
        exitDescriptions = createExitDescriptions()
    })

    it('should return an empty array when given an empty roomNames array', () => {
        const roomNames: string[] = []
        const maxDistance = 5
        const result = getClosestRooms(roomNames, maxDistance, describeExitsFn(exitDescriptions))
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
        const result = getClosestRooms(roomNames, maxDistance, describeExitsFn(exitDescriptions))
        expect(result).to.deep.include({ roomName: 'W6N8', distance: 1 })
        expect(result).to.deep.include({ roomName: 'W7N8', distance: 2 })
    })
})
