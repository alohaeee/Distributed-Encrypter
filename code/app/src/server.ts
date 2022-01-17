import express from 'express';
import bodyParser from 'body-parser';
import rest from './rest';
import config from './config';
import rpc from './rpc';

// приложение
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json())



// Реквест якорю о текущих работающих узлах.

app.get('/', (req, res) => {
  res.sendFile(__dirname + "/index.html");
});


/**
 * Ответ на запрос от якоря для определения узлов
 * @return 200 если инстанс готов к работе
 */
app.get('/services', (req, res) => {
  console.log("Succes on check availebility of service");
  res.send();
})
app.use(rest.GetServiceRouter());
app.use(rest.GetNodeRouter());

app.use(rpc.GetRpcRouter());


console.log(`Running on http://${config.host}:${config.port} with ${config.ID}`);
app.listen(config.port, config.host);


