import cors from 'cors';
import express from 'express';

import jssdk from '../jssdk';

const app = express();

app.use(cors({
  origin: '*',
}));

app.get('/jssdk', jssdk({
  appId: 'wx8372b24417f593f2',
  secret: 'd649471dad4e9530c2ed7068089d9a82',
  type: 'file',
  tokenFilename: __dirname + '/local-token.json',
  ticketFilename: __dirname + '/local-ticket.json',
}));

app.listen(3000, () => {
  console.log('web start');
});
