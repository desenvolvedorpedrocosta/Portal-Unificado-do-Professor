(function () {
  'use strict';

  var $ = function (selector) { return document.querySelector(selector); };
  var queryInput = $('#schoolQuery');
  var searchButton = $('#searchButton');
  var resultsList = $('#resultsList');
  var schoolDetail = $('#schoolDetail');
  var resultsCaption = $('#resultsCaption');
  var resultCount = $('#resultCount');
  var apiStatus = $('#apiStatus');
  var apiDot = $('#apiDot');
  var toastNode = $('#toast');
  var selectedKey = '';
  var debounceTimer = null;
  var lastSearchResults = [];
  var FOOTER_CREDIT_EMAIL = 'desenvolvedorpedrocosta@gmail.com';


  function cleanIdentifier(value) {
    if (value === null || value === undefined) return '';
    var text = String(value).trim();
    if (!text || /^(?:—|–|-|null|undefined|n\/?a|não informado|nao informado)$/i.test(text)) return '';
    return text.replace(/\.0$/, '');
  }

  function normalizeFieldName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function readSchoolValue(object, aliases) {
    if (!object || typeof object !== 'object') return '';
    var byName = {};
    Object.keys(object).forEach(function (key) {
      var normalizedKey = normalizeFieldName(key);
      var current = byName[normalizedKey];
      var incoming = object[key];
      if (!Object.prototype.hasOwnProperty.call(byName, normalizedKey) || (!cleanIdentifier(current) && cleanIdentifier(incoming))) {
        byName[normalizedKey] = incoming;
      }
    });
    for (var i = 0; i < aliases.length; i++) {
      var key = normalizeFieldName(aliases[i]);
      if (Object.prototype.hasOwnProperty.call(byName, key)) {
        var value = byName[key];
        if (value !== null && value !== undefined && cleanIdentifier(value) !== '') return value;
      }
    }
    return '';
  }

  function normalizeSchoolRecord(item) {
    var source = item && typeof item === 'object' ? item : {};
    var school = Object.assign({}, source);
    school.cie = cleanIdentifier(readSchoolValue(source, ['cie', 'codigoCie', 'codCie', 'CIE']));
    school.codigoInep = cleanIdentifier(readSchoolValue(source, ['codigoInep', 'inep', 'coEntidade', 'idInep', 'INEP']));
    school.idInterno = cleanIdentifier(readSchoolValue(source, [
      'idInterno', 'ID_INTERNO', 'id_interno', 'identificadorInterno', 'internalId',
      'schoolId', 'idEscola', 'id', 'chave', 'key', 'identificador', 'codigoInterno'
    ]));
    school.nome = readSchoolValue(source, ['nome', 'nomeEscola', 'Nome_da_Escola', 'NOME_ESCOLA', 'escola']);
    school.municipio = readSchoolValue(source, ['municipio', 'cidade', 'Municipio']);
    school.diretoria = readSchoolValue(source, ['diretoria', 'diretoriaEnsino', 'Diretoria_de_Ensino', 'ure']);
    school.tipo = readSchoolValue(source, ['tipo', 'tipoEscola', 'Tipo_de_Ensino']);
    school.zona = readSchoolValue(source, ['zona', 'ZONA']);
    school.telefones = readSchoolValue(source, ['telefones', 'telefone', 'TELEFONES']);
    school.email = readSchoolValue(source, ['email', 'eMail', 'EMAIL']);
    school.detalhes = source.detalhes || source.details || source.DETALHES || {};
    return school;
  }

  function schoolIdentity(school) {
    school = normalizeSchoolRecord(school);
    return school.idInterno || school.cie || school.codigoInep || [
      school.nome, school.municipio, school.diretoria,
      readSchoolValue(school.detalhes, ['Endereco_Completo', 'ENDERECO_COMPLETO', 'endereco'])
    ].map(function (part) { return normalizeFieldName(part); }).join('|');
  }

  function initFooter() {
    var yearNode = $('#footerYear');
    var emailNode = $('#footerCreditEmail');
    var currentYear = new Date().getFullYear();
    var year = Math.max(2026, currentYear);
    if (yearNode) yearNode.textContent = String(year);
    if (emailNode) {
      emailNode.href = 'mailto:' + FOOTER_CREDIT_EMAIL;
      emailNode.textContent = FOOTER_CREDIT_EMAIL;
    }
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined || value === '' ? '—' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function showToast(message, isError) {
    toastNode.textContent = message;
    toastNode.classList.toggle('error', !!isError);
    toastNode.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toastNode.classList.remove('show'); }, 4200);
  }

  function setApiState(state, message) {
    apiStatus.textContent = message;
    apiDot.classList.remove('online', 'offline');
    if (state === 'online') apiDot.classList.add('online');
    if (state === 'offline') apiDot.classList.add('offline');
  }

  function setLoading(isLoading) {
    searchButton.disabled = isLoading;
    searchButton.querySelector('span').textContent = isLoading ? 'Pesquisando...' : 'Pesquisar';
  }

  function renderEmpty(title, message) {
    resultsList.innerHTML = '<div class="empty-state compact-empty"><span class="empty-icon">⌕</span><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(message) + '</p></div>';
  }

  function renderResults(data) {
    var items = data.results || [];
    lastSearchResults = items.map(normalizeSchoolRecord);
    resultCount.textContent = data.total + (data.total === 1 ? ' resultado' : ' resultados');
    resultsCaption.textContent = items.length ? 'Selecione uma unidade' : 'Nenhuma correspondência';
    if (!items.length) {
      renderEmpty('Nenhuma escola encontrada', 'Tente pesquisar por parte do nome, pelo município ou pelo código CIE/INEP.');
      return;
    }
    resultsList.innerHTML = lastSearchResults.map(function (item, index) {
      // Os dados da escola permanecem em memória. Não usamos escapeHtml em
      // atributos de ID, pois o placeholder visual "—" não pode virar chave.
      return '<button type="button" class="result-item" data-result-index="' + index + '">' +
        '<span class="result-arrow" aria-hidden="true">↗</span>' +
        '<strong>' + escapeHtml(item.nome) + '</strong>' +
        '<span class="result-meta"><span>' + escapeHtml(item.municipio) + '</span><span>CIE: ' + escapeHtml(item.cie || 'não informado') + '</span><span>INEP: ' + escapeHtml(item.codigoInep || 'não informado') + '</span></span>' +
        '</button>';
    }).join('');

    Array.prototype.forEach.call(resultsList.querySelectorAll('.result-item'), function (button) {
      button.addEventListener('click', function () {
        Array.prototype.forEach.call(resultsList.querySelectorAll('.result-item'), function (b) { b.classList.remove('selected'); });
        button.classList.add('selected');
        var index = Number(button.getAttribute('data-result-index'));
        var selectedSchool = lastSearchResults[index];
        selectedKey = schoolIdentity(selectedSchool);
        if (selectedSchool) selectSchool(selectedSchool);
      });
    });
  }

  function field(label, value) {
    return '<div class="detail-field"><small>' + escapeHtml(label) + '</small><strong>' + escapeHtml(value) + '</strong></div>';
  }


  function normalizeAddressNumber(value) {
    var number = String(value === null || value === undefined ? '' : value).trim();
    if (!number) return '';
    if (/^(?:S\s*\/\s*N|SN)$/i.test(number)) return 'S/N';
    if (/^\d+$/.test(number)) return number.replace(/^0+(?=\d)/, '');
    return number;
  }

  function formatAddressForDisplay(rawAddress, separateNumber) {
    var address = String(rawAddress === null || rawAddress === undefined ? '' : rawAddress)
      .replace(/\s+/g, ' ').trim();
    var externalNumber = normalizeAddressNumber(separateNumber);
    if (!address) return externalNumber ? 'Nº ' + externalNumber : '';

    var suffix = address.match(/\s+-\s+(RUA|AVENIDA|AV\.?|ESTRADA|PRACA|PRAÇA|ALAMEDA|TRAVESSA|RODOVIA|ROD\.?|LARGO|VIELA|VIA|ACESSO|PASSAGEM)\s*$/i);
    var prefix = address.match(/^(RUA|AVENIDA|AV\.?|ESTRADA|PRACA|PRAÇA|ALAMEDA|TRAVESSA|RODOVIA|ROD\.?|LARGO|VIELA|VIA|ACESSO|PASSAGEM)\s+/i);
    var type = '';
    var streetAndNumber = address;

    if (suffix) {
      type = suffix[1].toUpperCase().replace(/\.$/, '');
      streetAndNumber = address.slice(0, suffix.index).trim();
    } else if (prefix) {
      type = prefix[1].toUpperCase().replace(/\.$/, '');
      streetAndNumber = address.slice(prefix[0].length).trim();
    }

    // Algumas exportações repetem o tipo no início e no sufixo. Evita duplicá-lo.
    if (type) {
      var repeatedPrefix = streetAndNumber.match(/^(RUA|AVENIDA|AV\.?|ESTRADA|PRACA|PRAÇA|ALAMEDA|TRAVESSA|RODOVIA|ROD\.?|LARGO|VIELA|VIA|ACESSO|PASSAGEM)\s+/i);
      if (repeatedPrefix && repeatedPrefix[1].toUpperCase().replace(/\.$/, '') === type) {
        streetAndNumber = streetAndNumber.slice(repeatedPrefix[0].length).trim();
      }
    }

    var numberMatch = streetAndNumber.match(/^(.*),\s*(S\s*\/\s*N|SN|\d{1,8})$/i);
    var street = streetAndNumber;
    var number = externalNumber;
    if (numberMatch) {
      street = numberMatch[1].trim();
      number = normalizeAddressNumber(numberMatch[2]) || number;
    }

    var formatted = type ? type + ' ' + street : street;
    if (number) formatted += (formatted ? ', ' : '') + number;
    return formatted.trim();
  }

  function extractCieFromInstitutionalEmail(email) {
    var value = String(email || '').trim();
    var match = value.match(/^E(\d{6})A@EDUCACAO\.SP\.GOV\.BR$/i);
    return match ? match[1] : '';
  }

  function buildCompleteAddress(address, bairro, municipio, cep) {
    var parts = [];
    if (address) parts.push(address);
    if (bairro) parts.push(bairro);
    if (municipio) parts.push(municipio + '/SP');
    if (cep) parts.push('CEP ' + cep);
    return parts.join(' · ');
  }

  function renderSchool(data, indicators) {
    var school = normalizeSchoolRecord(data.escola || data);
    var details = school.detalhes || {};
    var name = school.nome || readSchoolValue(details, ['NOME_ESCOLA', 'Nome_da_Escola']) || 'Escola sem nome cadastrado';
    var indicatorRows = indicators && Array.isArray(indicators.indicadores) ? indicators.indicadores : [];
    var addressRaw = readSchoolValue(school, ['endereco', 'Endereco_Completo', 'ENDERECO_COMPLETO']) ||
      readSchoolValue(details, ['ENDERECO_COMPLETO', 'Endereco_Completo', 'LOGRADOURO', 'ENDERECO']);
    var addressNumber = readSchoolValue(details, ['NUMERO', 'NUMERO_ENDERECO']) || readSchoolValue(school, ['numero']);
    var addressFallback = [
      readSchoolValue(details, ['LOGRADOURO', 'RUA', 'AVENIDA']),
      addressNumber,
      readSchoolValue(details, ['COMPLEMENTO'])
    ].filter(Boolean).join(', ');
    var formattedAddress = formatAddressForDisplay(addressRaw || addressFallback, addressNumber);
    var neighborhood = readSchoolValue(details, ['DISTRITO_BAIRRO', 'BAIRRO']) || readSchoolValue(school, ['bairro']);
    var cep = readSchoolValue(details, ['CEP']) || readSchoolValue(school, ['cep']);
    var municipality = school.municipio || readSchoolValue(details, ['MUNICIPIO', 'Municipio']);
    var email = school.email || readSchoolValue(details, ['EMAIL', 'E_MAIL']);
    var extractedCie = !school.cie ? extractCieFromInstitutionalEmail(email) : '';
    var displayedCie = school.cie || extractedCie;
    var completeAddress = buildCompleteAddress(formattedAddress, neighborhood, municipality, cep);
    var mapQuery = completeAddress || [name, municipality, 'SP'].filter(Boolean).join(', ');
    var mapUrl = mapQuery ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery) : '';
    var addressAuxHtml = completeAddress
      ? '<div class="school-address-tools"><div class="school-address-copy"><span class="school-address-label">ENDEREÇO COMPLETO</span><p class="school-address-full">' + escapeHtml(completeAddress) + '</p></div>' +
        (mapUrl ? '<a class="school-map-link" href="' + escapeHtml(mapUrl) + '" target="_blank" rel="noopener noreferrer">Ver no Google Maps ↗</a>' : '') + '</div>'
      : '';
    var cieNote = extractedCie ? '<small class="code-pill-note">(extraído do e-mail institucional)</small>' : '';
    var fields = [
      ['Diretoria de Ensino / URE', school.diretoria],
      ['Município', municipality],
      ['Tipo de escola', school.tipo],
      ['Endereço', formattedAddress || addressFallback],
      ['Bairro / Distrito', neighborhood],
      ['CEP', cep],
      ['Zona', school.zona || readSchoolValue(details, ['ZONA'])],
      ['Telefone', school.telefones || readSchoolValue(details, ['TELEFONES', 'TELEFONE'])],
      ['E-mail', email],
      ['Situação cadastral', readSchoolValue(details, ['SITUACAO_CADASTRAL', 'SITUACAO'])],
      ['Última referência da fonte', readSchoolValue(details, ['DATA_REFERENCIA', 'DATA_ATUALIZACAO'])]
    ];

    schoolDetail.innerHTML = '<div class="school-detail-head"><div class="section-kicker">FICHA CADASTRAL · REDE ESTADUAL</div>' +
      '<h3>' + escapeHtml(name) + '</h3>' +
      '<div class="school-subtitle">' + escapeHtml(municipality) + (school.diretoria ? ' · ' + escapeHtml(school.diretoria) : '') + '</div>' +
      '<div class="school-codes"><span class="code-pill">CIE: ' + escapeHtml(displayedCie || 'não informado na exportação') + cieNote + '</span><span class="code-pill">INEP: ' + escapeHtml(school.codigoInep || 'não informado na exportação') + '</span><span class="code-pill">ID interno: ' + escapeHtml(school.idInterno || 'não disponível') + '</span></div></div>' +
      '<div class="detail-grid">' + fields.map(function (f) { return field(f[0], f[1]); }).join('') + '</div>' +
      addressAuxHtml +
      '<div class="indicator-block"><h4>Indicadores históricos</h4>' + renderIndicators(indicatorRows, school, indicators) + '</div>';
  }

  function indicatorField(item, aliases) {
    return readSchoolValue(item, aliases);
  }

  function normalizeStageLabel(value) {
    var raw = String(value || '').trim();
    var normalized = normalizeFieldName(raw);
    if (!normalized) return 'Etapa não informada';
    if (['anosiniciais','ensinofundamentali','fundamentali','fundamental1','efai','efanosiniciais','1ao5ano','1a5ano'].indexOf(normalized) >= 0 || /anosiniciais/.test(normalized)) return 'Anos Iniciais';
    if (['anosfinais','ensinofundamentalii','fundamentalii','fundamental2','efaf','efanosfinais','6ao9ano','6a9ano'].indexOf(normalized) >= 0 || /anosfinais/.test(normalized)) return 'Anos Finais';
    if (['ensinomedio','medio','em','ensinomedioregular'].indexOf(normalized) >= 0 || /ensinomedio/.test(normalized)) return 'Ensino Médio';
    return raw;
  }

  function parseIndicatorNumber(value) {
    var text = String(value === null || value === undefined ? '' : value).trim().replace(/\s/g, '');
    if (!text) return null;
    if (text.indexOf(',') >= 0 && text.indexOf('.') >= 0) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(',', '.');
    var number = Number(text);
    return isFinite(number) ? number : null;
  }

  function formatIndicatorNumber(value) {
    var number = parseIndicatorNumber(value);
    return number === null ? escapeHtml(value) : number.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function renderIndicators(rows, school, response) {
    if (!rows.length) {
      if (response && (response.unavailable || response.ok === false)) {
        return '<div class="indicator-empty indicator-error">Não foi possível consultar os indicadores históricos neste momento. A ficha cadastral foi carregada, mas a conexão com a consulta de indicadores falhou. Tente novamente mais tarde.</div>';
      }
      return '<div class="indicator-empty">Ainda não há indicadores históricos vinculados a esta unidade. Quando os arquivos oficiais de IDESP e IDEB forem importados, os resultados aparecerão aqui.</div>';
    }
    var groups = {};
    rows.forEach(function (item) {
      var indicator = String(indicatorField(item, ['INDICADOR','indicator']) || 'Indicador').toUpperCase();
      var stage = normalizeStageLabel(indicatorField(item, ['ETAPA_ENSINO','etapaEnsino','stage']));
      var component = String(indicatorField(item, ['COMPONENTE_CURRICULAR','componenteCurricular','component']) || '');
      var key = [indicator, stage, component].join('|');
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    var orderedKeys = Object.keys(groups).sort(function (a, b) {
      var order = { IDESP: 1, IDEB: 2 };
      var ai = a.split('|')[0], bi = b.split('|')[0];
      return (order[ai] || 9) - (order[bi] || 9) || a.localeCompare(b, 'pt-BR');
    });
    return '<div class="indicator-groups">' + orderedKeys.map(function (key) {
      var group = groups[key].slice().sort(function (a, b) {
        return Number(indicatorField(a, ['ANO_REFERENCIA','anoReferencia','year'])) - Number(indicatorField(b, ['ANO_REFERENCIA','anoReferencia','year']));
      });
      var first = group[0];
      var indicatorName = String(indicatorField(first, ['INDICADOR','indicator']) || 'Indicador').toUpperCase();
      var stageName = normalizeStageLabel(indicatorField(first, ['ETAPA_ENSINO','etapaEnsino','stage']));
      var componentName = indicatorField(first, ['COMPONENTE_CURRICULAR','componenteCurricular','component']);
      var rowsHtml = group.map(function (item) {
        var year = indicatorField(item, ['ANO_REFERENCIA','anoReferencia','year']);
        var value = indicatorField(item, ['VALOR','valor','nota','resultado']);
        var meta = indicatorField(item, ['META','meta','VALOR_META','META_REFERENCIA']);
        var numericValue = parseIndicatorNumber(value);
        var width = numericValue === null ? 0 : Math.max(0, Math.min(100, numericValue / 10 * 100));
        var metaNumber = parseIndicatorNumber(meta);
        var metaHtml = metaNumber === null ? '' : '<span class="indicator-meta">Meta ' + formatIndicatorNumber(metaNumber) + '</span>';
        return '<div class="indicator-chart-row">' +
          '<span class="indicator-year">' + escapeHtml(year) + '</span>' +
          '<span class="indicator-track" aria-label="Resultado ' + escapeHtml(value) + ' de 10"><i style="width:' + width.toFixed(1) + '%"></i></span>' +
          '<span class="indicator-result"><strong>' + formatIndicatorNumber(value) + '</strong>' + metaHtml + '</span>' +
          '</div>';
      }).join('');
      return '<section class="indicator-group indicator-group-' + escapeHtml(indicatorName.toLowerCase()) + '">' +
        '<div class="indicator-group-head"><strong>' + escapeHtml(indicatorName) + '</strong><span>' + escapeHtml(stageName) + '</span></div>' +
        (componentName ? '<div class="indicator-component">' + escapeHtml(componentName) + '</div>' : '') + rowsHtml +
        '</section>';
    }).join('') + '</div><div class="indicator-footnote">Resultados conforme os arquivos oficiais importados. Metas são exibidas somente quando constarem na fonte. Ausência de IDEB não significa nota zero: pode decorrer dos critérios de participação ou divulgação. Confira ano, etapa e metodologia antes de comparar séries diferentes.</div>';
  }

  async function doSearch() {
    var query = queryInput.value.trim();
    if (query.length < 2) {
      showToast('Digite pelo menos 2 caracteres para pesquisar.', true);
      queryInput.focus();
      return;
    }
    setLoading(true);
    resultsCaption.textContent = 'Consultando base...';
    renderEmpty('Consultando escolas...', 'Aguarde enquanto pesquisamos o cadastro oficial.');
    try {
      var data = await window.PortalAPI.buscarEscolas(query, 20);
      renderResults(data);
      setApiState('online', 'Base conectada');
      if (!data.total) showToast('Nenhuma escola encontrada para essa pesquisa.');
    } catch (error) {
      setApiState('offline', 'Falha na conexão');
      resultsCaption.textContent = 'Consulta indisponível';
      renderEmpty('Não foi possível consultar', error.message || 'Verifique a implantação da API.');
      showToast(error.message || 'Falha ao consultar a base.', true);
    } finally {
      setLoading(false);
    }
  }

  async function selectSchool(schoolRecord) {
    var selectedSchool = normalizeSchoolRecord(schoolRecord);
    schoolDetail.innerHTML = '<div class="empty-state detail-empty"><span class="empty-icon">⋯</span><strong>Carregando ficha da escola</strong><p>Buscando cadastro e indicadores disponíveis.</p></div>';
    try {
      var detailPromise = window.PortalAPI.obterEscola(selectedSchool, null, selectedSchool).catch(function (error) {
        return { ok: true, escola: selectedSchool, fallbackFromSearch: true, detailWarning: error.message };
      });
      var indicatorsPromise = window.PortalAPI.obterIndicadores(selectedSchool).catch(function (error) {
        return { ok: false, unavailable: true, total: null, indicadores: [], message: error && error.message ? error.message : 'Falha ao consultar indicadores.' };
      });
      var results = await Promise.all([detailPromise, indicatorsPromise]);
      var detailResult = results[0] || {};
      var indicatorResult = results[1] || { indicadores: [] };
      var apiSchool = detailResult.escola || {};
      var mergedRawSchool = Object.assign({}, selectedSchool);
      Object.keys(apiSchool).forEach(function (key) {
        var value = apiSchool[key];
        if (value !== null && value !== undefined && String(value).trim() !== '') mergedRawSchool[key] = value;
      });
      var mergedSchool = normalizeSchoolRecord(mergedRawSchool);
      if (!mergedSchool.detalhes || !Object.keys(mergedSchool.detalhes).length) {
        mergedSchool.detalhes = selectedSchool.detalhes || {};
      }
      renderSchool({ escola: mergedSchool }, indicatorResult);
      setApiState('online', 'Base conectada');
      if (detailResult.fallbackFromSearch) {
        showToast('Ficha aberta com os dados retornados pela busca. Alguns detalhes podem não estar disponíveis.', false);
      }
    } catch (error) {
      // Salvaguarda final: o card selecionado é um objeto válido da busca,
      // portanto não descartamos a ficha por falha na rota de detalhe.
      if (selectedSchool && (selectedSchool.nome || selectedSchool.municipio || selectedSchool.idInterno)) {
        renderSchool({ escola: selectedSchool }, { indicadores: [] });
        showToast('Ficha básica aberta com os dados da busca. Indicadores ou detalhes adicionais indisponíveis.', false);
        return;
      }
      schoolDetail.innerHTML = '<div class="empty-state detail-empty"><strong>Não foi possível abrir a ficha</strong><p>' + escapeHtml(error.message) + '</p></div>';
      showToast(error.message || 'Falha ao abrir a ficha da escola.', true);
    }
  }

  function setupTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab-button'), function (button) {
      button.addEventListener('click', function () {
        var target = button.getAttribute('data-tab');
        Array.prototype.forEach.call(document.querySelectorAll('.tab-button'), function (tab) {
          var active = tab === button;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (panel) {
          var active = panel.id === 'panel-' + target;
          panel.classList.toggle('active', active);
          panel.hidden = !active;
        });
      });
    });
  }

  async function checkHealth() {
    try {
      var data = await window.PortalAPI.health();
      setApiState('online', 'Base conectada · ' + (data.base ? data.base.escolas : 0) + ' escolas');
    } catch (error) {
      setApiState('offline', 'API ainda não configurada');
    }
  }

  searchButton.addEventListener('click', doSearch);
  queryInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') doSearch(); });
  queryInput.addEventListener('input', function () {
    window.clearTimeout(debounceTimer);
    var value = queryInput.value.trim();
    if (value.length >= 3) debounceTimer = window.setTimeout(doSearch, 650);
  });
  setupTabs();
  initFooter();
  checkHealth();
})();
