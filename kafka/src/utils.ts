import config from './config';
import fetch from 'node-fetch';

export interface TypedRequestBody<T> extends Express.Request {
    body: T
}

// Хелпер методы для массива
export function Sample<T>(arr: Array<T>): T {
    return arr[Math.floor(Math.random() * arr.length)];
};

const DAEMON_URL = config.ID === undefined ? "http://0.0.0.0:8079" : "http://daemonjs:8079";
export async function GetPeers() {
    let peers: string[] = [];
    console.log("In get peers method")

    let result = await fetch(`${DAEMON_URL}/?from=${config.ID}`);
    let json = await result.json();

    if (result.ok) {
        console.log("Get peers result: " + JSON.stringify(json));
        peers = json as string[];
    }
    return peers;
}
function GetUrlForPeer(peer: string): string {
    return `http://${peer}:${config.port}`;
}

function Split(str: string, count: number): string[] {
    const strLength: number = str.length;
    const size = str.length / count;
    const numChunks: number = count;
    const chunks: string[] = new Array(numChunks);

    let i = 0;
    let o = 0;

    for (; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size);
    }

    return chunks;
}

function SmartSplit(str: string, count: number, minSizeToSplit: number = 300): string[] {
    if (minSizeToSplit > str.length / count) {
        return Split(str, str.length / minSizeToSplit);
    }
    else {
        return Split(str, count);
    }
}
export default { Sample, GetPeers, GetUrlForPeer, Split, SmartSplit }