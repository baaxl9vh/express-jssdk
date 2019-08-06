import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import redis, { ClientOpts, RedisClient } from 'redis';

/**
 * 持久化
 * 1. file，保存到文件上
 * 2. redis，保存到redis
 * 3. 不保存
 */
type SaveType = 'file' | 'redis' | 'none';

/**
 * 配置项
 */
interface IJSSDKOptions {
  /**
   * 是否企业号，默认false
   */
  corp?: boolean;
  /**
   * 公众号appId
   */
  appId: string;
  /**
   * 公众号secret
   */
  secret: string;
  /**
   * 随机字符串长度，最长32位，默认16位
   */
  nonceStrLength?: number;
  /**
   * ticket和token持久化类型，默认none，可选redis、file
   */
  type?: SaveType;
  /**
   * redis host，type = redis时，必须提供
   */
  redisHost?: string;
  /**
   * redis port，type = redis时，必须提供
   */
  redisPort?: number;
  /**
   * redis password
   */
  redisAuth?: string;
  /**
   * token 缓存文件，type = file时，必须提供
   */
  tokenFilename?: string;
  /**
   * ticket 缓存文件，type = file时，必须提供
   */
  ticketFilename?: string;
  /**
   * 是否缓存在进程内存，默认true
   */
  cache?: boolean;
  /**
   * 打开调试，默认false
   */
  debug?: boolean;
}

interface ITokenData {
  accessToken?: string;
  ticket?: string;
  expireTime: number;
}

type Callback = (err: Error | null, ret: ITokenData | null) => void;

interface ISignResult {
  /**
   * error code
   * 1. 4001，需要签名的url参数没有提供
   * 2. 内部获取jssdk api ticket错误
   * 3. 0正常签名
   */
  errCode: 4001 | 4002 | 0;
  msg?: string;
  appId?: string;
  nonceStr?: string;
  timestamp?: number;
  url?: string;
  signature?: string;
}

interface IExpressResponse {
  json: (body?: any) => void;
}
interface IExpressRequest {
  query: any;
  body: any;
}

const TAG = 'jssdk';

const NONCE_STR_MAX = 32;
const GET_TICKET_URL = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket?type=jsapi&access_token=';
const GET_TICKET_URL_CORP = 'https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=';

const REDIS_KEY_TOKEN = 'jssdk.token';
const REDIS_KEY_TICKET = 'jssdk.ticket';

/**
 * 配置项
 */
const defOptions: IJSSDKOptions = {
  corp: false,                                            // 是否企业号
  appId: '',
  secret: '',
  nonceStrLength: 16,                                     // 随机字符串长度，最长32位
  type: 'none',                                           // ticket和token持久化类型，默认none，可选file、redis
  redisHost: '127.0.0.1',                                 // redis host
  redisPort: 6379,                                        // redis port
  tokenFilename: __dirname + '/local-token.json',
  ticketFilename: __dirname + '/local-ticket.json',
  cache: true,
  debug: false,
};

/**
 * 票据
 */
const TYPE_TICKET = 1;
/**
 * TOKEN
 */
const TYPE_TOKEN = 2;

/**
 * TODO:
 * v.0.1.x版本，支持多appId版本
 */
export default class JSSDK {

  public static createRequestHandler(_options: IJSSDKOptions): (req: IExpressRequest, res: IExpressResponse) => void {
    const ins = new JSSDK(_options);
    return (req: IExpressRequest, res: IExpressResponse) => {
      ins.signUrl(req.query.url, (ret: ISignResult) => {
        res.json(ret);
      });
    };
  }

  public static createFunction(_options: IJSSDKOptions): (url: string, cb: (ret: ISignResult) => void) => void {
    const ins = new JSSDK(_options);
    return ins.signUrl;
  }

  public static sign(options: IJSSDKOptions, url: string, cb: (ret: ISignResult) => void): void {
    const ins = new JSSDK(options);
    ins.signUrl(url, cb);
  }

  private options: IJSSDKOptions;
  private redisClient: RedisClient | undefined;
  private ticketCache: ITokenData;
  private tokenCache: ITokenData;

  constructor(options: IJSSDKOptions) {
    this.ticketCache = { expireTime: 0, ticket: ''};
    this.tokenCache = { expireTime: 0, accessToken: '' };
    if (!options.appId || !options.secret) {
      throw new Error('appId and secret must be provided!');
    }
    if (options.type === 'file' && (!options.tokenFilename || !options.ticketFilename)) {
      throw new Error('if type = file, tokenFilename and ticketFilename must be provided!');
    }
    if (options.type === 'redis' && (!options.redisHost || !options.redisPort)) {
      throw new Error('if type = redis, redis config must be provided!');
    }
    this.options = Object.assign({}, defOptions, options);
    // type 设置为 none时，强制使用进程内存
    if ('none' === this.options.type) { this.options.cache = true; }

    // 票据token储到redis
    if ('redis' === this.options.type) {
      const conf: ClientOpts = {
        host: this.options.redisHost,
        port: this.options.redisPort,
      };
      if (this.options.redisAuth) {
        conf.password = this.options.redisAuth;
      }
      this.redisClient = redis.createClient(conf);
      this.redisClient.on('error', (err) => {
        console.error(TAG, 'redis error:', err.message);
        // 连接不上redis时，cache开启
        this.options.cache = true;
      });
      this.redisClient.on('connect', () => {
        if (this.options.debug) { console.log(TAG, 'redis connected to the server:',
          this.redisClient && this.redisClient.connection_id); }
      });
    }
  }

  private signUrl(url: string, cb: (ret: ISignResult) => void): void {
    if (!url) {
      cb({
        errCode: 4001,
        msg: 'argument url must be provided!',
      });
      return;
    }
    this.getJsApiTicket((err, ticket) => {
      if (err) {
        cb({
          errCode: 4002,
          msg: err.message,
        });
        return;
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const nonceStr = this.createNonceStr(this.options.nonceStrLength);
      const signStr = 'jsapi_ticket=' + ticket + '&noncestr=' + nonceStr + '&timestamp=' + timestamp + '&url=' + url;
      const signature = crypto.createHash('sha1').update(signStr).digest('hex');
      cb({
        errCode: 0,
        appId: this.options.appId,
        nonceStr,
        timestamp,
        url,
        signature,
      });
    });
  }

  private createNonceStr(length: number = 16) {
    length = length || 16;
    length = length > NONCE_STR_MAX ? NONCE_STR_MAX : length;
    let str = '';
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < length; i++) {
      str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
  }

  private getAccessToken(cb: (err: Error | null, token: string | null) => void) {
    this.readTokenOrTicket(this.options.type || 'none', TYPE_TOKEN, (err, data) => {
      if (err || !data || !data.accessToken || data.expireTime < Date.now()) {
        // 如果是企业号用以下URL获取access_token
        let url = '';
        if (this.options.corp) {
          url = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid='
            + this.options.appId + '&corpsecret=' + this.options.secret;
        } else {
          url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid='
            + this.options.appId + '&secret=' + this.options.secret;
        }
        https.get(url, (res) => {
          res.on('data', (d: Buffer) => {
            const tokenData: ITokenData = {
              accessToken: '',
              expireTime: 0,
            };
            let ret;
            try {
              // 正常 {"access_token":"ACCESS_TOKEN","expires_in":7200}
              // 错误 {"errcode":40013,"errmsg":"invalid appid"}
              ret = JSON.parse(d.toString());
            } catch (error) {
              cb(new Error('get token parse error'), null);
              return;
            }
            if (ret && ret.access_token) {
              tokenData.accessToken = ret.access_token;
              tokenData.expireTime = Date.now() + 7000000;
              cb(null, tokenData.accessToken || '');
              this.saveTokenOrTicket(this.options.type || 'none', TYPE_TOKEN, tokenData);
            } else if (ret.errcode) {
              cb(new Error(d.toString()), null);
            } else {
              cb(new Error('No token!'), null);
            }
          });
        }).on('error', (e) => {
          cb(e, null);
        });
      } else {
        cb(null, data.accessToken);
      }
    });
  }

  private getJsApiTicket(cb: (err: Error | null, ticket: string | null) => void) {
    this.readTokenOrTicket(this.options.type || 'none', TYPE_TICKET, (err, data) => {
      if (err || !data || !data.expireTime || data.expireTime < Date.now()) {
        this.getAccessToken((error, token) => {
          if (error) {
            cb(error, null);
            return;
          }
          https.get(this.options.corp ? GET_TICKET_URL_CORP + token : GET_TICKET_URL + token, (res) => {
            res.on('data', (d) => {
              const ticketData: ITokenData = {
                ticket: '',
                expireTime: 0,
              };
              let ret;
              try {
                // 正常 {"errcode":0,"errmsg":"ok","ticket":"xx","expires_in":7200}
                ret = JSON.parse(d);
              } catch (error) {
                cb(new Error('get ticket parse error'), null);
                return;
              }
              if (ret && ret.errcode === 0 && ret.ticket) {
                ticketData.ticket = ret.ticket;
                ticketData.expireTime = Date.now() + 7000000;
                cb(null, ret.ticket);
                this.saveTokenOrTicket(this.options.type || 'none', TYPE_TICKET, ticketData);
              } else {
                cb(new Error('No ticket!'), null);
              }
            });
          }).on('error', (_httpError: Error) => {
            cb(error, null);
          });
        });
      } else {
        if (data.ticket) {
          cb(null, data.ticket);
        } else {
          cb(new Error('Ticket not Found'), null);
        }
      }
    });
  }

/**
 * 保存票据token
 * @param {string} saveType token保存类型file本地文件，redis
 * @param {number} tokenOrTicket
 * @param {object} data
 * @param {string} fileName
 */
private saveTokenOrTicket(saveType: SaveType, tokenOrTicket: number, data: ITokenData) {
  if (this.options.cache) { this.refreshCache(tokenOrTicket, data); }
  if ('redis' === saveType) {
    if (!this.redisClient || !this.redisClient.connected) {
      console.warn(TAG, 'redis disconnected');
      // redis未建立连接，且未开启缓存，开启缓存并缓存数据
      if (!this.options.cache) {
        if (this.options.debug) { console.log(TAG, 'redis disconnected, set cache = true.'); }
        this.options.cache = true;
        this.refreshCache(tokenOrTicket, data);
      }
      return;
    }
    const key = tokenOrTicket === TYPE_TICKET ? REDIS_KEY_TICKET : REDIS_KEY_TOKEN;
    this.redisClient.set(key, JSON.stringify(data));
  } else if ('file' === saveType) {
    const fileName = tokenOrTicket === TYPE_TICKET ? this.options.ticketFilename : this.options.tokenFilename;
    if (!fileName) {
      if (!this.options.cache) {
        if (this.options.debug) { console.log(TAG, 'type = file and no filename, set cache = true.'); }
        this.options.cache = true;
        this.refreshCache(tokenOrTicket, data);
      }
      return;
    }
    fs.writeFile(fileName, JSON.stringify(data), (err) => {
      if (err) {
        // 保存到文件上失败，且未开启缓存，开启缓存并缓存数据
        if (!this.options.cache) {
          if (this.options.debug) { console.log(TAG, 'save to file error, set cache = true.'); }
          this.options.cache = true;
          this.refreshCache(tokenOrTicket, data);
        }
        console.error(TAG, 'Save to File (' + fileName + ') Error:', err.message);
      }
    });
  }
}

private refreshCache(tokenOrTicket: number, data: ITokenData) {
  if (this.options.debug) { console.log(TAG, ' refresh cache, TYPE =', tokenOrTicket, 'data =', data); }
  if (tokenOrTicket === TYPE_TICKET) {
    this.ticketCache.expireTime = data.expireTime;
    this.ticketCache.ticket = data.ticket;
  } else {
    this.tokenCache.expireTime = data.expireTime;
    this.tokenCache.accessToken = data.accessToken;
  }
}

/**
 * 读取缓存的票据token
 * @param {string} saveType [file, redis, mem]
 * @param {number} tokenOrTicket
 * @param {function} cb
 */
private readTokenOrTicket(saveType: SaveType, tokenOrTicket: number, cb: Callback) {
  if (this.options.cache) {
    if (tokenOrTicket === TYPE_TICKET) {
      if (this.ticketCache && this.ticketCache.ticket && this.ticketCache.expireTime > Date.now()) {
        // 内存有缓存
        cb(null, this.ticketCache);
        if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: read ticket from cache'); }
        return;
      }
    } else {
      if (this.tokenCache && this.tokenCache.accessToken && this.tokenCache.expireTime > Date.now()) {
        if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: read token from cache'); }
        cb(null, this.tokenCache);
        return;
      }
    }
  }
  if ('redis' === saveType) {
    if (!this.redisClient || !this.redisClient.connected) {
      if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: redis disconnected'); }
      cb(new Error('redis disconnected'), null);
      return;
    }
    const key = tokenOrTicket === TYPE_TICKET ? REDIS_KEY_TICKET : REDIS_KEY_TOKEN;
    this.redisClient.get(key, (err, reply) => {
      if (err) {
        if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: read redis error =', err.message); }
        cb(err, null);
      } else {
        try {
          cb(err, JSON.parse(reply.toString()) as ITokenData);
          if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: reply =', reply); }
        } catch (error) {
          if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: type = redis, parse data  error =', error); }
          cb(error, null);
        }
      }
    });
  } else if ('file' === saveType) {
    const fileName = tokenOrTicket === TYPE_TICKET ? this.options.ticketFilename : this.options.tokenFilename;
    if (!fileName) {
      cb(new Error('No filename'), null);
      return;
    }
    fs.readFile(fileName, (err, data) => {
      if (err) {
        if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: read file error =', err.message); }
        cb(err, null);
      } else {
        try {
          cb(err, JSON.parse(data.toString()) as ITokenData);
          if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: buffer =', data); }
        } catch (error) {
          if (this.options.debug) { console.log(TAG, 'readTokenOrTicket: type = file, parse data error =', error); }
          cb(error, null);
        }
      }
    });
  } else {
    // 不是file也不是redis，返回空，让后面逻辑去微信服务器请求
    cb(null, null);
  }
}

}
