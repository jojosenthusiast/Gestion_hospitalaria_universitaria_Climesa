/** Identificador nacional compartido por pacientes y personal. */
export function validDui(value:string):boolean {
 const n=value.replace(/-/g,'');
 return /^\d{9}$/.test(n)&&/[1-9]/.test(n.slice(0,8))&&(10-[...n.slice(0,8)].reduce((sum,c,i)=>sum+Number(c)*(9-i),0)%10)%10===Number(n[8]);
}
