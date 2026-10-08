import {randomUUID} from "node:crypto";
import {query} from "./index";
import type {AnalyticsEvent} from "../ANALYTICS";
export async function trackAnalyticsEvent(event:AnalyticsEvent,path:string){await query("INSERT INTO analytics_events(id,event,path) VALUES($1,$2,$3)",[randomUUID(),event,path.slice(0,200)]);}
export async function analyticsSummary(days=30){
  const bounded=Math.max(1,Math.min(365,days));
  const interval="now()-(($1::text || ' days')::interval)";
  const total=(await query<{count:string}>("SELECT count(*)::text AS count FROM analytics_events WHERE created_at>="+interval,[bounded]))[0]?.count||"0";
  const by=await query<{event:AnalyticsEvent;count:string}>("SELECT event,count(*)::text AS count FROM analytics_events WHERE created_at>="+interval+" GROUP BY event",[bounded]);
  const pages=await query<{path:string;count:string}>("SELECT path,count(*)::text AS count FROM analytics_events WHERE event='page_view' AND created_at>="+interval+" GROUP BY path ORDER BY count(*) DESC LIMIT 10",[bounded]);
  const byEvent={page_view:0,product_view:0,checkout_start:0};for(const row of by)byEvent[row.event]=Number(row.count);
  return {days:bounded,total:Number(total),byEvent,topPages:pages.map(row=>({path:row.path,count:Number(row.count)}))};
}