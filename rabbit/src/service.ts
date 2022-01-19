import { Router } from "express";
import multer from "multer";
import amqp from "amqplib";
import config from "./config";
import assert from "assert";
import utils from "./utils";
import { EventEmitter } from "events";
import cryptapi from "./cryptapi";
const memoryStorage = multer.memoryStorage();
const memoryUpload = multer({ storage: memoryStorage });


function generateCorrelationId() {
    let id = "";
    for (let i = 0; i < 10; i++) {
        id += Math.random().toString();
    }
    return id;
}
class RabbitMQConfig {
    static host = "rabbit";
    static ip = `amqp://${RabbitMQConfig.host}`;
    static jobsQueue = "fs-queue";
    static maxNodeJobsCount = 10;
}
let Config =
{
    RequestGroup: `RequestGroup`,
    RequestTopic: `RequestTopic`,
    ReplyTopic: `ReplyTopic`,
    ReplyGroup: `ReplyGroup${config.ID}`,
}


interface RequesterData {
    data: any[]
    count?: number
}

export async function GetServiceRouter() {
    let connection = await amqp.connect(RabbitMQConfig.ip);

    let serviceChannel = await connection.createChannel();

    class Requester {
        StoreReply(correlationId: string, message: any) {
            let request = this.requestList[correlationId];
            if (request === undefined) {
                return false;
            }
            console.log(`Store reply: ${JSON.stringify(message)}`);

            request.data.push(message);
            if (request.count) {
                if (request.count >= request.data.length) {
                    this.emmiter.emit("countFire", correlationId);
                }
            }

            return true;
        }

        async Request(method: string, params: any, topic = Config.RequestTopic, tm: number = 5000, count: number = 0): Promise<any[]> {
            const message_id: string = generateCorrelationId();
            this.requestList[message_id] = { data: [], count: count };


            await serviceChannel.sendToQueue(topic, Buffer.from(JSON.stringify({ method: method, params: params })),
                { correlationId: message_id });

            return new Promise<any[]>(async (resolve, reject) => {
                setInterval(
                    () => {
                        const requestedData = this.requestList[message_id];
                        if (requestedData != undefined) {
                            if (requestedData.data.length !== count) {
                                reject("Timeout");
                            }
                            resolve(requestedData.data);
                            delete this.requestList[message_id];

                        }
                        else {
                            assert("requestedData is undefined");
                            reject([]);
                        }
                    },
                    tm);
                this.emmiter.on("countFire", (correlationId: string) => {
                    if (correlationId === message_id) {
                        const requestedData = this.requestList[message_id];
                        if (requestedData != undefined) {
                            assert(requestedData.data.length === count);
                            resolve(requestedData.data);
                            delete this.requestList[message_id];

                        }
                        else {
                            assert("requestedData is undefined");
                            reject([]);
                        }
                    }

                })
            });
        }
        async RequestSingle(method: string, params: any, topic = Config.RequestTopic, tm: number = 5000) {
            let request = await this.Request(method, params, topic, tm, 1);
            return request[0];
        }
        private emmiter: EventEmitter = new EventEmitter();
        private requestList: { [id: string]: RequesterData } = {};
    };

    async function ServiceHandler(req: any, method: string) {
        if (!req.file) {
            throw Error("NoFile");
        }
        if (!req.file.buffer) {
            throw Error("EmptyFile");
        }
        let key = req.body["key"];
        if (!req.body["key"]) {
            throw Error("EmptyKey");
        }
        let message = req.file.buffer.toString();
        let queueStatus = await serviceChannel.assertQueue(Config.RequestTopic);

        let parts: string[] = utils.Split(message, queueStatus.consumerCount);
        console.log({ parts: parts });
        let promisesList: Promise<any>[] = [];
        for (let i in parts) {
            // Более логично сделать батч запрос. 
            promisesList.push(requester.RequestSingle(method, { message: parts[i], key: key }));
        }
        let results = await Promise.all(promisesList);
        let mutatedData: string = "";
        for (let i in results) {
            const result = results[i];
            if (result.reply) {
                mutatedData += result.reply;
            }
            else {
                console.error("wrong format");
                throw Error("Something goes wrong");
            }
        }
        return mutatedData;
    };


    let requester = new Requester();


    // Для сервиса. Делаем только один сервис, чтобы не усложнять пересылку ответа.
    if (Number(config.ID) === 0) {
        await serviceChannel.assertQueue(Config.ReplyTopic);
        await serviceChannel.consume(Config.ReplyTopic, async (message) => {
            try {
                if (message) {
                    if (message.properties.correlationId) {
                        let correlationId = message.properties.correlationId;
                        if (correlationId != undefined) {
                            let msg = JSON.parse(message.content.toString());
                            requester.StoreReply(correlationId.toString(), msg);
                        }
                    }
                }
            }
            catch (err) {
                console.error(err);
            }
            finally{
                if (message){
                    serviceChannel.ack(message);
                }
            }
           
        });
    }
    // Для нод
    await serviceChannel.assertQueue(Config.RequestTopic);
    await serviceChannel.consume(Config.RequestTopic, async (message) => {
        console.log("GOT MESSAGE");
        if (message) {
            if (message.properties.correlationId) {
                let correlationId = message.properties.correlationId;
                try {
                    let msg = JSON.parse(message.content.toString());
                    let result: Buffer = await cryptapi.CallMethod(msg.method, msg.params.message, msg.params.key);
                    //await serviceChannel.assertQueue(Config.ReplyTopic);
                    await serviceChannel.sendToQueue(Config.ReplyTopic, Buffer.from(JSON.stringify({ reply: result.toString() })), { correlationId: correlationId });
                }
                catch (err) {
                    console.log(err);
                    //await serviceChannel.assertQueue(Config.ReplyTopic);
                    await serviceChannel.sendToQueue(Config.ReplyTopic, Buffer.from(JSON.stringify({ error: err })), { correlationId: correlationId });
                }
            }
            serviceChannel.ack(message);
        }
    });

    const router = Router();

    router.post('/encrypt', memoryUpload.single("uploadFile"), async (req, res) => {
        console.log(`encrypt: ${JSON.stringify(req.body)}`);
        try {
            let result = await ServiceHandler(req, "Encrypt");
            res.send(result);
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
            let result = await ServiceHandler(req, "Decrypt");
            res.send(result);
        }
        catch (error) {
            res.status(400);
            console.log(error);
            res.send(error);
        }
    });

    return router;
}

export default { GetServiceRouter }