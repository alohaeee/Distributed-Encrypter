import { Router } from "express";
import cryptapi from './cryptapi';
import { GetPeers } from "./utils";
import utils from "./utils";
import fetch from 'node-fetch';
import { Response } from 'node-fetch'
import { JSONRPCServer } from 'json-rpc-2.0';

// /**
//  * RPC
//  */

const RPCServer = new JSONRPCServer();

let nextId: number = 0;
let createID = () => nextId++;

async function RequestRpc(url: string, method: string, params: object): Promise<Response> {
    return fetch(`${url}/rpc`, {
        headers:
            { 'Content-Type': 'application/json' }
        , body: JSON.stringify({ "jsonrpc": "2.0", "method": method, "params": params, "id": createID() }), method: 'POST'
    });
}


interface CryptoParams {
    message: string
    key: string
}

async function PerformRpcTaskFlow(params: any, method: string)
{
    let p = params as CryptoParams;

    let peers = await GetPeers();

    let message: string = p.message;
    console.log({ message: message });

    let key: string = p.key;
    let parts: string[] = utils.Split(message, peers.length);
    console.log({ parts: parts });
    let promises: Promise<Response>[] = [];

    for (const i in parts) {
        const peer = peers[i];
        promises.push(RequestRpc(utils.GetUrlForPeer(peer), method,  { message: parts[i], key: key }));
    }
    let results = await Promise.all(promises);

    let resultMessage: string = "";
    for (let i in results) {
        const result = results[i];
        let json = await result.json();
        let res = json["result"];
        if (res) {
            let text = res['message'];
            resultMessage += text;
        }
        else {
            throw Error("Somethings goes wrong. Try again");
        }
    }
    return resultMessage;
}
// Сервис
RPCServer.addMethod('encrypt', async (params) => {
    console.log("encrypt service");

    return PerformRpcTaskFlow(params, "Encryption");
});

RPCServer.addMethod('decrypt', async (params): Promise<any> => {
    console.log("decrypt service");
    return PerformRpcTaskFlow(params, "Decryption");
});
// Ноды
RPCServer.addMethod('Encryption', async (params): Promise<any> => {
    console.log("encrypt node");
    let p = params as CryptoParams;
    let buffer = cryptapi.CallMethod('Encrypt', p.message, p.key);

    return {message: buffer.toString()};
});

RPCServer.addMethod('Decryption', async (params): Promise<any> => {
    console.log("decrypt node");
    let p = params as CryptoParams;
    let buffer = cryptapi.CallMethod('Decrypt', p.message, p.key);

    return {message: buffer.toString()};
});

export function GetRpcRouter() {
    const router = Router();

    router.post("/rpc", (req, res) => {
        console.log(`RPC request: ${JSON.stringify(req.body)}`)
        const jsonRPCRequest = req.body;
        // server.receive takes a JSON-RPC request and returns a promise of a JSON-RPC response.
        // It can also receive an array of requests, in which case it may return an array of responses.
        // Alternatively, you can use server.receiveJSON, which takes JSON string as is (in this case req.body).
        RPCServer.receive(jsonRPCRequest).then((jsonRPCResponse) => {
            if (jsonRPCResponse) {
                console.log(`Send RPC: ${JSON.stringify(jsonRPCResponse)}`)
                res.json(jsonRPCResponse);
            } else {
                // If response is absent, it was a JSON-RPC notification method.
                // Respond with no content status (204).
                res.sendStatus(204);
            }
        });
    });
    return router;
}

export default {GetRpcRouter}