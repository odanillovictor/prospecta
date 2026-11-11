// Libera o envio real (trava de seguranca). O app ainda exige o modo teste desligado e a aprovacao de cada mensagem.
process.env.ROBO_ENVIO_REAL = '1';
await import('./server.mjs');
