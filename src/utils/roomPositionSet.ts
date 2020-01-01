export function add(pos: RoomPosition, posSet: RoomPositionSet) {
    const found = posSet.find(npos => pos.isEqualTo(npos))
    if (!found) {
        posSet.push(pos)
    }
}

export function merge(arr: RoomPosition[], posSet: RoomPositionSet) {
    for (const pos of arr) {
        add(pos, posSet)
    }
}
