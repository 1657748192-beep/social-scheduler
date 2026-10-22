/** Provider-controlled input is bounded and never echoed verbatim. */
export function metaRetryAfter(value:string|null,now=Date.now()):number{
 const seconds=value&&/^\d+$/.test(value)?Number(value):value?Math.ceil((Date.parse(value)-now)/1000):60;
 return Number.isFinite(seconds)?Math.max(1,Math.min(3600,seconds)):60;
}
