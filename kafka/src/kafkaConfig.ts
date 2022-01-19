import config from "./config";

export let Config =
{
  RequestGroup: `RequestGroup`,
  RequestTopic: `RequestTopic`,
  ReplyTopic: `ReplyTopic`,
  ReplyGroup: `ReplyGroup${config.ID}`,
}

export default { Config } 