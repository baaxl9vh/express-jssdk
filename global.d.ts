
type SaveType = 'file' | 'redis' | 'mem';

/**
 * 配置项
 */
interface ConfigOptions {
  /**
   * 是否企业号
   */
  corp?: boolean,
  appId: string,
  secret: string,
  /**
   * 随机字符串长度，最长32位
   */
  nonceStrLength?: number,
  /**
   * ticket和token持久化类型，默认file，可选redis、内存mem
   */
  type: SaveType,
  /**
   * redis host
   */
  redisHost?: string,
  /**
   * redis port
   */
  redisPort?: number,
  /**
   * redis password
   */
  redisAuth?: string,
  tokenFilename?: string,
  ticketFilename?: string,
}

interface TokenData {
  accessToken?: string;
  ticket?: string;
  expireTime: number;
}

type Callback = (err: Error | null, ret: TokenData | null) => void;

interface SignResult {
  appId: string;
  nonceStr: string;
  timestamp: number;
  url: string;
  signature: string;
}

type SignCallback = (err: Error | null, ret: SignResult | null) => void;


interface ExpressResponse {
  json: (data: object) => void;
}
interface ExpressRequest {
  query: any;
  body: any;
}