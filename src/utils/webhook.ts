// eslint-disable-next-line header/header
import AsyncRetry from 'async-retry';
import Axios from 'axios';

import { NODE_NAME, PDUTY_ROUTING_KEY, PING_ID, WEBHOOK_URL } from '../config';
import logger from '../log';

export default async function sendWebhookMessage({
  name,
  value = 'no value',
  content,
  username = NODE_NAME,
  ping = false,
  webhookUrl = WEBHOOK_URL,
  pagerDutyRoutingKey = PDUTY_ROUTING_KEY,
  pingId = PING_ID,
  component = undefined,
  critical = false,
  info = [],
  useDiscord = true,
  usePagerDuty = true,
}: {
  name: string;
  value?: string;
  content?: string;
  username?: string;
  critical?: boolean;
  ping?: boolean;
  webhookUrl?: string;
  pagerDutyRoutingKey?: string;
  pingId?: string;
  component?: string;
  info?: { name: string; value: string }[];
  useDiscord?: boolean;
  usePagerDuty?: boolean;
  race?: boolean;
  raceTimeout?: number;
}): Promise<void> {
  try {
    // TODO: disallow `any` types codebase-wide so this isn't required.
    if (typeof value !== 'string')
      value = (value as any)?.toString() ?? JSON.stringify(value);
    if (typeof name !== 'string')
      name = (name as any)?.toString() ?? JSON.stringify(name);

    if (name.length >= 256) {
      value = name.slice(250) + value;
      name = name.slice(0, 250) + '...';
    }
    if (component && username.length + component.length < 32)
      username = username + ':' + component;

    // max is 6k characters
    if (value.length >= 6000) {
      value =
        value.slice(0, 5500) +
        ' `Cut-off due to exceeding maximum character limit`';
    }

    let vl = value;
    value = value.slice(0, 1020);
    let i = 1;

    while ((vl = vl.slice(1020)).length > 0) {
      info.push({ name: `Continuation ${i++}`, value: vl.slice(0, 1020) });
    }

    info.push({ name: 'Timestamp', value: new Date().toISOString() });
    const data = {
      content: (content ?? '') + `${ping ? (pingId ? `${pingId}` : '') : ''}`,
      username: username,
      embeds: [
        {
          color: 15548997,
          fields: [{ name, value }, ...info],
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const severity = critical ? 'critical' : ping ? 'error' : 'warning';
    logger.error(`[webhook] ${name} - ${value}`);
    if (usePagerDuty && pagerDutyRoutingKey) {
      // let [{ name, value }, ...info] = fields;
      const data = {
        routing_key: pagerDutyRoutingKey,
        payload: {
          summary: name + ' ' + (value === 'no value' ? '' : value),
          severity,
          source: username,
          component: component,
          custom_details: {
            value,
            ...info.reduce((acc: any, { name, value }) => {
              acc[name] = value;
              return acc;
            }, {}),
          },
        },
        event_action: 'trigger',
      };

      await AsyncRetry(
        () =>
          Axios.post('https://events.pagerduty.com/v2/enqueue', data, {
            headers: { 'content-type': 'application/json' },
          }),
        {
          retries: 10,
          onRetry: (_: any, a: number) => {
            // Incrementally reduce properties in a bid to avoid any malformed payloads.
            switch (a) {
              case 4:
                data.payload.custom_details = value;
                break;
              case 6:
                data.payload.summary = name;
                break;
            }
          },
        },
      ).catch((e: any) => {
        logger.error(
          `[webhook:pagerDuty] Unable to post error to pagerduty - ${e}`,
        );
        logger.debug(
          `[webhook:pagerDuty] request body: ${JSON.stringify(data)}`,
        );
        if (webhookUrl)
          Axios.post(webhookUrl, {
            content: `${
              critical ? pingId ?? '' : ''
            } Unable to post error to pagerduty\n${e
              .toString()
              .slice(0, 1000)}`,
            username,
          }).catch((e) => logger.error(`[webhook] ${e}`));
      });
    }

    logger.warn(
      `[webhook] Notification ${webhookUrl ? '' : 'not '}posted to webhook`,
    );

    if (useDiscord && webhookUrl)
      await AsyncRetry(() => Axios.post(webhookUrl, data), {
        retries: 10,
        onRetry: (_: any, a: number) => {
          // Incrementally reduce properties in a bid to avoid any malformed payloads.
          switch (a) {
            case 4:
              data.embeds = data.embeds.slice(0, 2);
              break;
          }
        },
      }).catch((e: any) => {
        logger.error(`[webhook] Unable to post error to webhook - ${e}`);
        logger.debug(`[webhook] request body: ${JSON.stringify(data)}`);
        Axios.post(webhookUrl, {
          content: `${
            ping ? pingId ?? '' : ''
          } Unable to post error to webhook`,
          username,
        }).catch((e) => logger.error(`[webhook] ${e}`));
      });
  } catch (err) {
    logger.error(
      `[webhook] Unable to post webhook with field ${name} ${value} - ${err}`,
    );
  }
}
