export function commitNumber(draft,fallback,min,max,step=1){
  draft=draft.normalize('NFKC').replaceAll('−','-');
  if(!draft.trim()||!Number.isFinite(Number(draft)))return fallback;
  const value=Math.max(min,Math.min(max,Number(draft)));
  return Number(Math.max(min,Math.min(max,min+Math.round((value-min)/step)*step)).toFixed(8));
}
