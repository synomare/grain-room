// Grapheme clusters keep combining accents and emoji sequences together.
export function glyphCharacters(text){
 if(typeof text!=='string'||text.length>512)throw Error('使う文字は512文字以内で入力してください。');
 const clusters=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),s=>s.segment);
 const chars=[...new Set(clusters.filter(c=>!/^\s+$/u.test(c)&&!/[\p{Cc}\p{Cs}]/u.test(c)))];
 if(chars.length>64)throw Error('使う文字は64字種以内で入力してください。');
 return chars;
}
