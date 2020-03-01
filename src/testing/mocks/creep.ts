import { mockInstanceOf } from 'screeps-jest'
import { v4 as uuidv4 } from 'uuid'

export default (parts: BodyPartConstant[]) => {
    const id = uuidv4() as Id<Creep>
    return mockInstanceOf<Creep>({
        id,
        name: `creep:${id}`,
        store: {
            getCapacity: () => {
                return parts.reduce(
                    (acc, val) => (val === CARRY ? acc + CARRY_CAPACITY : acc),
                    0,
                )
            },
        },
    })
}
