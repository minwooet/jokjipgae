export async function confirmPayment(paymentKey, orderId, amount) {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) throw new Error('TOSS_SECRET_KEY가 설정되지 않았어요.');

  const basic = Buffer.from(`${secretKey}:`).toString('base64');
  const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Basic ${basic}`,
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || `토스 결제 승인 실패 (${res.status})`);
  }
  return data;
}
