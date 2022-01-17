import { Router } from "express";
import cryptapi from './cryptapi';
import { GetPeers } from "./utils";
import utils from "./utils";
import fetch from 'node-fetch';
import {Response} from 'node-fetch'
import multer from 'multer';

const memoryStorage = multer.memoryStorage();
const memoryUpload = multer({ storage: memoryStorage });


export function GetServiceRouter()
{
    const router = Router();

    
    router.post('/encrypt', memoryUpload.single("uploadFile"), async (req, res) => {
        console.log(`encrypt: ${JSON.stringify(req.body)}`);
        try {
            if (!req.file)
            {
                throw Error("NoFile");
            }
            if (!req.file.buffer)
            {
                throw Error("EmptyFile");
            }
            let peers = await GetPeers();
            let message: string = req.file.buffer.toString();
            console.log({message: message});

            let key : string = req.body['key'];
            let parts: string[] = utils.Split(message, peers.length);
            console.log({parts: parts});
            let promises: Promise<Response>[] = [];
           
            for (const i in parts) {
                const peer = peers[i];
                promises.push(fetch(`${utils.GetUrlForPeer(peer)}/Encryption`, {
                    headers:
                      { 'Content-Type': 'application/json' }
                    , body: JSON.stringify({params: {message: parts[i], key: key}}), method: 'POST'
                  }));
            }
            let results = await Promise.all(promises);

            let resultMessage: string = "";
            for (let i in results)
            {
                const result = results[i];
                if (result.ok){
                    let text = await result.text();
                    resultMessage += text;
                }
                else{
                    throw Error("Somethings goes wrong. Try again");
                }
            }
            res.send(resultMessage);
        }
        catch (error) {
          res.status(400);
          console.log(error);
          res.send(error);
        }
    });

    router.post('/decrypt', memoryUpload.single("uploadFile"), async (req, res) => {
        console.log(`decrypt: ${JSON.stringify(req.body)}`);
        try {
            if (!req.file)
            {
                throw Error("NoFile");
            }
            if (!req.file.buffer)
            {
                throw Error("EmptyFile");
            }
            let peers = await GetPeers();
            let message: string = req.file.buffer.toString();

            let key : string = req.body['key'];
            let parts: string[] = utils.Split(message, peers.length);
            console.log({parts: parts});
            let promises: Promise<Response>[] = [];
           
            for (const i in parts) {
                const peer = peers[i];
                promises.push(fetch(`${utils.GetUrlForPeer(peer)}/Decryption`, {
                    headers:
                      { 'Content-Type': 'application/json' }
                    , body: JSON.stringify({params: {message: parts[i], key: key}}), method: 'POST'
                  }));
            }
            let results = await Promise.all(promises);

            let resultMessage: string = "";
            for (let i in results)
            {
                const result = results[i];
                if (result.ok){
                    let text = await result.text();
                    resultMessage += text;
                }
                else{
                    throw Error("Somethings goes wrong. Try again");
                }
            }
            console.log("send encrypted file");
            res.send(resultMessage);
        }
        catch (error) {
          res.status(400);
          console.log(error);
          res.send(error);
        }
    });

    return router;
}


export function GetNodeRouter()
{
    const router = Router();

    router.post('/Encryption', async (req, res) => {
        console.log(`Encryption: ${JSON.stringify(req.body)}`);
        try {
            let params = req.body['params'];
            let message: string = params['message'];
            let key: string = params['key'];
            let buffer = cryptapi.CallMethod('Encrypt', message, key)
            res.send(buffer.toString());
        }
        catch (error) {
          res.status(400);
          console.log(error);
          res.send(error);
        }
    });

    router.post('/Decryption', async (req, res) => {
        console.log(`decrypt: ${JSON.stringify(req.body)}`);
        try {
            let params = req.body['params'];
            let message: string = params['message'];
            let key: string = params['key'];
            let buffer = cryptapi.CallMethod('Decrypt', message, key)
            res.send(buffer.toString());
        }
        catch (error) {
          res.status(400);
          console.log(error);
          res.send(error);
        }
    });
    return router;
}

export default { GetServiceRouter, GetNodeRouter }