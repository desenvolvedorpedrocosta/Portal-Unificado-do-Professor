/**
 * Cliente JSONP do Portal Unificado.
 * URL oficial da implantação Apps Script do Portal Unificado. Preserve esta URL ao atualizar o arquivo.
 * Não coloque chaves secretas neste arquivo.
 */
(function (global) {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbxRaA_NLHownNuFKxSMv4f9jFSAP1vTzcL-9I69zUDcuRwMpq-LLIixAgRUK4Q0-XsP/exec';
  var sequence = 0;
  var NOT_FOUND_CODES = ['ESCOLA_NAO_ENCONTRADA', 'IDENTIFICADOR_AUSENTE'];

  function cleanIdentifier(value) {
    if (value === null || value === undefined) return '';
    var text = String(value).trim();
    if (!text || /^(?:—|–|-|null|undefined|n\/?a|não informado|nao informado)$/i.test(text)) return '';
    return text.replace(/\.0$/, '');
  }

  function normalizeFieldName(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function readAlias(object, aliases) {
    if (!object || typeof object !== 'object') return '';
    var keys = Object.keys(object);
    var normalized = {};
    keys.forEach(function (key) {
      var normalizedKey = normalizeFieldName(key);
      var current = normalized[normalizedKey];
      var incoming = object[key];
      if (!Object.prototype.hasOwnProperty.call(normalized, normalizedKey) || (!cleanIdentifier(current) && cleanIdentifier(incoming))) {
        normalized[normalizedKey] = incoming;
      }
    });
    for (var i = 0; i < aliases.length; i++) {
      var key = normalizeFieldName(aliases[i]);
      if (Object.prototype.hasOwnProperty.call(normalized, key)) {
        var value = cleanIdentifier(normalized[key]);
        if (value) return value;
      }
    }
    return '';
  }

  function normalizeSchoolRecord(school) {
    var source = school && typeof school === 'object' ? school : {};
    var result = Object.assign({}, source);
    result.cie = readAlias(source, ['cie', 'codigoCie', 'codCie', 'codigoEscolaCie']);
    result.codigoInep = readAlias(source, ['codigoInep', 'inep', 'coEntidade', 'idInep', 'codigoInepEscola']);
    result.idInterno = readAlias(source, [
      'idInterno', 'ID_INTERNO', 'id_interno', 'identificadorInterno',
      'internalId', 'schoolId', 'idEscola', 'id', 'chave', 'key',
      'identificador', 'codigoInterno'
    ]);
    result.nome = readAlias(source, ['nome', 'nomeEscola', 'Nome_da_Escola', 'NOME_ESCOLA', 'escola']);
    result.municipio = readAlias(source, ['municipio', 'cidade', 'Municipio']);
    result.diretoria = readAlias(source, ['diretoria', 'diretoriaEnsino', 'Diretoria_de_Ensino', 'ure']);
    result.tipo = readAlias(source, ['tipo', 'tipoEscola', 'Tipo_de_Ensino']);
    result.zona = readAlias(source, ['zona', 'ZONA']);
    result.telefones = readAlias(source, ['telefones', 'telefone', 'TELEFONES']);
    result.email = readAlias(source, ['email', 'eMail', 'EMAIL']);
    result.detalhes = source.detalhes || source.details || source.DETALHES || {};
    return result;
  }

  function buildIdentifierCandidates(value, preferredType) {
    var candidates = [];
    var seen = {};
    var school = value && typeof value === 'object' ? normalizeSchoolRecord(value) : null;

    function add(type, rawValue) {
      var id = cleanIdentifier(rawValue);
      if (!id || !type) return;
      var key = type + '|' + id;
      if (seen[key]) return;
      seen[key] = true;
      candidates.push({ type: type, value: id });
    }

    if (!school) {
      add(preferredType || 'id', value);
      return candidates;
    }

    // ID_INTERNO é a chave mais estável da exportação FDE sem CIE/INEP.
    add('id', school.idInterno);
    add('cie', school.cie);
    add('inep', school.codigoInep);

    // Alguns formatos intermediários usam somente "codigo" ou uma chave composta.
    // Tentamos "codigo" como ID e CIE, sem assumir previamente seu significado.
    var genericCode = readAlias(value, ['codigo', 'codEscola', 'codigoUnidade']);
    add('id', genericCode);
    add('cie', genericCode);
    add('id', readAlias(value, ['chaveComposta', 'schoolKey', 'identificadorApi', 'chaveNormalizada']));
    return candidates;
  }

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
          var error = new Error((data && data.message) || 'A consulta não pôde ser concluída.');
          error.apiCode = data && data.error ? String(data.error) : '';
          error.apiResponse = data || null;
          reject(error);
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

  function paramsFor(candidate) {
    var params = {};
    if (candidate.type === 'cie') params.cie = candidate.value;
    else if (candidate.type === 'inep') params.inep = candidate.value;
    else params.id = candidate.value;
    return params;
  }

  async function obterEscola(identificador, tipo, fallbackSchool) {
    var fallback = identificador && typeof identificador === 'object'
      ? normalizeSchoolRecord(identificador)
      : (fallbackSchool ? normalizeSchoolRecord(fallbackSchool) : null);
    var candidates = buildIdentifierCandidates(identificador, tipo);
    var lastError = null;

    for (var i = 0; i < candidates.length; i++) {
      try {
        var data = await request('getEscola', paramsFor(candidates[i]));
        if (data && data.escola) return data;
        lastError = new Error('A API respondeu sem os dados da escola.');
      } catch (error) {
        lastError = error;
        if (!error.apiCode || NOT_FOUND_CODES.indexOf(error.apiCode) < 0) break;
      }
    }

    // A busca já retornou um objeto válido: usa-o como fallback em vez de
    // bloquear a abertura da ficha quando a API de detalhe não reconhece a chave.
    if (fallback && (fallback.nome || fallback.municipio || fallback.idInterno || fallback.cie || fallback.codigoInep)) {
      return {
        ok: true,
        escola: fallback,
        fallbackFromSearch: true,
        detailWarning: lastError ? lastError.message : 'A ficha detalhada não foi localizada; foram utilizados os dados retornados pela busca.'
      };
    }

    throw lastError || new Error('Nenhuma escola foi encontrada com esse identificador.');
  }

  async function obterIndicadores(identificador, tipo) {
    var candidates = buildIdentifierCandidates(identificador, tipo);
    var lastError = null;
    var emptyResponse = { ok: true, total: 0, indicadores: [] };

    for (var i = 0; i < candidates.length; i++) {
      try {
        var data = await request('getIndicadores', paramsFor(candidates[i]));
        if (data && Array.isArray(data.indicadores) && data.indicadores.length) return data;
        if (data) emptyResponse = data;
      } catch (error) {
        lastError = error;
        if (!error.apiCode || NOT_FOUND_CODES.indexOf(error.apiCode) < 0) break;
      }
    }

    if (lastError && !(identificador && typeof identificador === 'object')) throw lastError;
    return emptyResponse;
  }

  global.PortalAPI = {
    health: function () { return request('health'); },
    buscarEscolas: function (q, limit) { return request('searchEscolas', { q: q, limit: limit || 15 }); },
    obterEscola: obterEscola,
    obterIndicadores: obterIndicadores,
    normalizarEscola: normalizeSchoolRecord,
    montarIdentificadores: buildIdentifierCandidates
  };
})(window);
