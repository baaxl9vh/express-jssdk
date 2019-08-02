import cors from 'cors';
import express from 'express';

import jssdk from '../jssdk';

const app = express();

app.use(cors({
  origin: '*',
}));

app.get('/jssdk', jssdk({
  appId: 'your app id',
  secret: 'your secret',
  type: 'file',
  tokenFilename: __dirname + '/local-token.json',
  ticketFilename: __dirname + '/local-ticket.json',
}));

app.listen(3000, () => {
  console.log('web start');
});
