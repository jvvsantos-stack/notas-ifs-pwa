import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Registra o Service Worker com atualização automática. Quando o app fica
// pronto para funcionar offline pela primeira vez, avisa no console — não
// há necessidade de prompt visível para o usuário nesse fluxo.
registerSW({
  immediate: true,
  onOfflineReady() {
    console.info('App pronto para uso offline.');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
