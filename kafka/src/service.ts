import { Router } from "express";
import multer from "multer";
import { Kafka, KafkaMessage } from 'kafkajs';
import config from "./config";
import assert from "assert";
import KafkaConfig from "./kafkaConfig";
import utils from "./utils";
import { EventEmitter } from "events";
import cryptapi from "./cryptapi";
const memoryStorage = multer.memoryStorage();
const memoryUpload = multer({ storage: memoryStorage });


function generateCorrelationId() {
    let id = "";
    for (let i = 0 ; i < 10; i++){
        id+= Math.random().toString();
    }
    return id;
}
const kafka = new Kafka({
    clientId: `service${config.ID}`,
    brokers: ['kafka:9092']
})

const producer = kafka.producer()
producer.connect()

const consumer = kafka.consumer({ groupId: KafkaConfig.Config.ReplyGroup })

consumer.connect()
consumer.subscribe({ topic: KafkaConfig.Config.ReplyTopic })

const admin = kafka.admin();
admin.connect();



interface RequesterData {
    data: any[]
    count?: number
}
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

    async Request(method: string, params: any, topic = KafkaConfig.Config.RequestTopic, tm: number = 5000, count: number = 0): Promise<any[]> {
        const message_id: string = generateCorrelationId();
        this.requestList[message_id] = { data: [], count: count };
        await producer.send({
            topic: topic,
            messages: [
                { value: JSON.stringify({ method: method, params: params }), headers: { correlationId: message_id } }
            ]
        });


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
    async RequestSingle(method: string, params: any, topic = KafkaConfig.Config.RequestTopic, tm: number = 5000) {
        let request = await this.Request(method, params, topic, tm, 1);
        return request[0];
    }
    private emmiter: EventEmitter = new EventEmitter();
    private requestList: { [id: string]: RequesterData } = {};
};

let requester = new Requester();

consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
        try {
            if (message.value) {
                if (message.headers) {
                    let correlationId = message.headers.correlationId;
                    if (correlationId != undefined) {
                        let msg = JSON.parse(message.value.toString());
                        requester.StoreReply(correlationId.toString(), msg);
                    }
                }
            }
        }
        catch (err) {
            console.error(err);
        }
    },
})
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
    let topicMetadata = await admin.fetchTopicMetadata({ topics: [KafkaConfig.Config.RequestTopic] });
    let topic = topicMetadata.topics[0];
    if (!topic) {
        throw Error("Somethings goes wrong. Try again");
    }

    let parts: string[] = utils.Split(message, topic.partitions.length);
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
}
export function GetServiceRouter() {
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


export async function RunNodeHandler() {
    const nodeProducer = await kafka.producer()
    nodeProducer.connect()

    const nodeConsumer = await kafka.consumer({ groupId: KafkaConfig.Config.RequestGroup })

    nodeConsumer.connect()
    nodeConsumer.subscribe({ topic: KafkaConfig.Config.RequestTopic })

    await nodeConsumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            console.log("[NodeConsumer] Got message")
            if (message.headers) {
                if (message.headers.correlationId) {
                    let correlationId = message.headers.correlationId;
                    try {
                        if (!message.value) {
                            throw Error("Empty message");
                        }
                        const msg = JSON.parse(message.value.toString() as string);
                        console.log("CallMethod");
                        let result: Buffer = await cryptapi.CallMethod(msg.method, msg.params.message, msg.params.key);
                        nodeProducer.send({
                            topic: KafkaConfig.Config.ReplyTopic,
                            messages: [
                                { value: JSON.stringify({ reply: result.toString() }), headers: { correlationId: correlationId } }
                            ]
                        });
                    }
                    catch (err) {
                        console.error(err);
                        console.log("Send to Reply Topic");
                        nodeProducer.send({
                            topic: KafkaConfig.Config.ReplyTopic,
                            messages: [
                                { value: JSON.stringify({ error: JSON.stringify(err) }), headers: { correlationId: correlationId } }
                            ]
                        });
                    }
                }
            }
        }
    });
}

export default { GetServiceRouter, RunNodeHandler };