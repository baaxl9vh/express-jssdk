
import express from 'express';

declare function e(options?: e.Options): express.RequestHandler;

declare namespace e {
  
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
  interface Options {
    /**
     * 是否企业号，默认false
     */
    corp?: boolean,
    /**
     * 公众号appId
     */
    appId: string,
    /**
     * 公众号secret
     */
    secret: string,
    /**
     * 随机字符串长度，最长32位，默认16位
     */
    nonceStrLength?: number,
    /**
     * ticket和token持久化类型，默认none，可选redis、file
     */
    type?: SaveType,
    /**
     * redis host，type = redis时，必须提供
     */
    redisHost?: string,
    /**
     * redis port，type = redis时，必须提供
     */
    redisPort?: number,
    /**
     * redis password
     */
    redisAuth?: string,
    /**
     * token 缓存文件，type = file时，必须提供
     */
    tokenFilename?: string,
    /**
     * ticket 缓存文件，type = file时，必须提供
     */
    ticketFilename?: string,
    /**
     * 是否缓存在进程内存，默认true
     */
    cache?: boolean,
    /**
     * 打开调试，默认false
     */
    debug?: boolean,
  }
  /**
   * 签名结果
   */
  interface Result {
    /**
     * error code
     * 1. 4001，需要签名的url参数没有提供
     * 2. 内部获取jssdk api ticket错误
     * 3. 0正常签名
     */
    errCode: 4001 | 4002 | 0;
    /**
     * error message
     */
    msg?: string;
    /**
     * wehcat appid
     */
    appId?: string;
    /**
     * random string
     */
    nonceStr?: string;
    /**
     * Timestamp
     */
    timestamp?: number;
    /**
     * sign url
     */
    url?: string;
    /**
     * 签名
     */
    signature?: string;
  }

  /**
   * 关闭redis连接
   */
}

export = e;