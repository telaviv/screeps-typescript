export function randomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]
}

export function calcTransactionAmount(
    amount: number,
    roomName1: string,
    roomName2: string,
): number {
    const dist = Game.map.getRoomLinearDistance(roomName1, roomName2)
    return Math.floor(amount / (2 - Math.exp(-dist / 30)))
}
