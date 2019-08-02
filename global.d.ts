
type SaveType = 'file' | 'redis' | 'mem';

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