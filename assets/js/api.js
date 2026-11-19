/**
 * Cliente JSONP do Portal Unificado.
 * Preencha API_URL com a URL /exec da implantação do Apps Script.
 * Não coloque chaves secretas neste arquivo.
 */
(function (global) {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbxRaA_NLHownNuFKxSMv4f9jFSAP1vTzcL-9I69zUDcuRwMpq-LLIixAgRUK4Q0-XsP/exec';
  var sequence = 0;

  function request(action, params) {
    return new Promise(function (resolve, reject) {
      if (!API_URL || API_URL.indexOf('https://script.google.com/macros/s/') !== 0) {
        reject(new Error('Configure a URL /exec do Apps Script em assets/js/api.js.'));
        return;
      }

      var callbackName = '__portalApiCallback' + (++sequence) + '_' + Date.now();
      var query = new URLSearchParams(params || {});
      query.set('action', action);
      query.set('callback', callbackName);
      query.set('_', String(Date.now()));

      var script = document.createElement('script');
      var timeout = global.setTimeout(function () {
        cleanup();
        reject(new Error('Tempo esgotado ao consultar a base de escolas.'));
      }, 20000);

      function cleanup() {
        global.clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete global[callbackName]; } catch (e) { global[callbackName] = undefined; }
      }

      global[callbackName] = function (data) {
        cleanup();
        if (!data || data.ok !== true) {
          reject(new Error((data && data.message) || 'A consulta não pôde ser concluída.'));
          return;
        }
        resolve(data);
      };

      script.onerror = function () {
        cleanup();
        reject(new Error('Não foi possível carregar a API do Portal. Verifique a implantação do Apps Script.'));
      };
      script.src = API_URL + (API_URL.indexOf('?') >= 0 ? '&' : '?') + query.toString();
      document.head.appendChild(script);
    });
  }

  global.PortalAPI = {
    health: function () { return request('health'); },
    buscarEscolas: function (q, limit) { return request('searchEscolas', { q: q, limit: limit || 15 }); },
    obterEscola: function (identificador, tipo) {
      var params = {};
      if (tipo === 'id') params.id = identificador;
      else params[tipo === 'inep' ? 'inep' : 'cie'] = identificador;
      return request('getEscola', params);
    },
    obterIndicadores: function (identificador, tipo) {
      var params = {};
      if (tipo === 'id') params.id = identificador;
      else params[tipo === 'inep' ? 'inep' : 'cie'] = identificador;
      return request('getIndicadores', params);
    }
  };
})(window);
