/**
 * Fonksiyon çalışma zamanının kendisini sınayan uç nokta.
 *
 * NEDEN VAR. `/api/demo-gunler` ve `/api/demo-hava` canlıda
 * FUNCTION_INVOCATION_FAILED veriyordu. İkisi farklı işler yapıyor ve
 * farklı dosyalar içe aktarıyor; ikisinin de düşmesi, sorunun kodun
 * kendisinde değil KURULUMDA olabileceğini söylüyor. Bu dosyanın HİÇBİR
 * içe aktarması yok: yanıt verirse sorun içe aktarılan dosyalarda,
 * vermezse çalışma zamanı/ayar tarafında demektir.
 *
 * Teşhis bittiğinde kaldırılacak.
 */
interface VercelYanit {
  status(kod: number): VercelYanit;
  setHeader(ad: string, deger: string): void;
  send(govde: string): void;
}

export default function handler(_req: unknown, res: VercelYanit): void {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.status(200).send(JSON.stringify({
    durum: 'ayakta',
    node: process.version,
    zaman: new Date().toISOString(),
  }));
}
