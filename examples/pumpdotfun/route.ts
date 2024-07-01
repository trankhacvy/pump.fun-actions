import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Connection,
  Keypair,
} from '@solana/web3.js';
import { PumpFunSDK } from 'pumpdotfun-sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  actionSpecOpenApiPostRequestBody,
  actionsSpecOpenApiGetResponse,
  actionsSpecOpenApiPostResponse,
} from '../openapi';
import { prepareTransaction } from '../../shared/transaction-utils';
import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';

const BUY_AMOUNT_SOL_OPTIONS = [1, 5, 10];
const DEFAULT_BUY_AMOUNT_SOL = 1;

const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['PumpDotFun'],
    responses: actionsSpecOpenApiGetResponse,
  }),
  async (c) => {
    const address = c.req.param('token') as string;

    const token = await getTokenInfo(address);

    const amountParameterName = 'amount';

    const response: ActionGetResponse = {
      icon: token.content.links.image,
      label: `${DEFAULT_BUY_AMOUNT_SOL} SOL`,
      title: token.content.metadata.name,
      description: `${token.content.metadata.description}`,
      links: {
        actions: [
          ...BUY_AMOUNT_SOL_OPTIONS.map((amount) => ({
            label: `${amount} SOL`,
            href: `/api/pumpdotfun/${address}/${amount}`,
          })),
          {
            href: `/api/pumpdotfun/${address}/{${amountParameterName}}`,
            label: `Buy ${token.content.metadata.symbol}`,
            parameters: [
              {
                name: amountParameterName,
                label: 'Enter a custom SOL amount',
              },
            ],
          },
        ],
      },
    };

    return c.json(response, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{amount}',
    tags: ['PumpDotFun'],
    request: {
      params: z.object({
        amount: z.string().openapi({
          param: {
            name: 'amount',
            in: 'path',
          },
          type: 'number',
          example: '1',
        }),
      }),
    },
    responses: actionsSpecOpenApiGetResponse,
  }),
  async (c) => {
    const address = c.req.param('token') as string;

    const token = await getTokenInfo(address);

    const response: ActionGetResponse = {
      icon: token.content.links.image,
      label: `${DEFAULT_BUY_AMOUNT_SOL} SOL`,
      title: token.content.metadata.name,
      description: token.content.metadata.description,
    };
    return c.json(response, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/{amount}',
    tags: ['PumpDotFun'],
    request: {
      params: z.object({
        amount: z
          .string()
          .optional()
          .openapi({
            param: {
              name: 'amount',
              in: 'path',
              required: false,
            },
            type: 'number',
            example: '1',
          }),
      }),
      body: actionSpecOpenApiPostRequestBody,
    },
    responses: actionsSpecOpenApiPostResponse,
  }),
  async (c) => {
    const amount = c.req.param('amount') ?? DEFAULT_BUY_AMOUNT_SOL.toString();

    const address = c.req.param('token') as string;

    const { account } = (await c.req.json()) as ActionPostRequest;

    const buyAmountSol = BigInt(Number(amount) * LAMPORTS_PER_SOL);
    const SLIPPAGE_BASIS_POINTS = 100n;

    const connection = new Connection(process.env.RPC_URL!);
    const kp = Keypair.generate();

    const wallet = new Wallet(kp);
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'finalized',
    });

    const sdk = new PumpFunSDK(provider);

    const buyTx = await sdk.getBuyInstructionsBySolAmount(
      new PublicKey(account),
      new PublicKey(address),
      buyAmountSol,
      SLIPPAGE_BASIS_POINTS,
    );

    const tx = await prepareTransaction(
      buyTx.instructions,
      new PublicKey(account),
    );

    console.dir(tx, { depth: null });

    const response: ActionPostResponse = {
      transaction: Buffer.from(tx.serialize()).toString('base64'),
    };

    return c.json(response, 200);
  },
);

async function getTokenInfo(address: string) {
  const response = await fetch(process.env.RPC_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'text',
      method: 'getAsset',
      params: {
        id: address,
      },
    }),
  });

  const data = await response.json();

  // console.dir(data, { depth: null });

  return data.result;
}

export default app;
