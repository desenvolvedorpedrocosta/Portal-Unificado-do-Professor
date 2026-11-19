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
    resultCount.textContent = data.total + (data.total === 1 ? ' resultado' : ' resultados');
    resultsCaption.textContent = items.length ? 'Selecione uma unidade' : 'Nenhuma correspondência';
    if (!items.length) {
      renderEmpty('Nenhuma escola encontrada', 'Tente pesquisar por parte do nome, pelo município ou pelo código CIE/INEP.');
      return;
    }
    resultsList.innerHTML = items.map(function (item, index) {
      var key = item.cie || item.codigoInep || item.idInterno || String(index);
      return '<button type="button" class="result-item" data-cie="' + escapeHtml(item.cie) + '" data-inep="' + escapeHtml(item.codigoInep) + '" data-id="' + escapeHtml(item.idInterno) + '" data-key="' + escapeHtml(key) + '">' +
        '<span class="result-arrow" aria-hidden="true">↗</span>' +
        '<strong>' + escapeHtml(item.nome) + '</strong>' +
        '<span class="result-meta"><span>' + escapeHtml(item.municipio) + '</span><span>CIE: ' + escapeHtml(item.cie || 'não informado') + '</span><span>INEP: ' + escapeHtml(item.codigoInep || 'não informado') + '</span></span>' +
        '</button>';
    }).join('');

    Array.prototype.forEach.call(resultsList.querySelectorAll('.result-item'), function (button) {
      button.addEventListener('click', function () {
        Array.prototype.forEach.call(resultsList.querySelectorAll('.result-item'), function (b) { b.classList.remove('selected'); });
        button.classList.add('selected');
        selectedKey = button.getAttribute('data-key');
        selectSchool(button.getAttribute('data-cie'), button.getAttribute('data-inep'), button.getAttribute('data-id'));
      });
    });
  }

  function field(label, value) {
    return '<div class="detail-field"><small>' + escapeHtml(label) + '</small><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function renderSchool(data, indicators) {
    var school = data.escola;
    var details = school.detalhes || {};
    var name = school.nome || details.NOME_ESCOLA || 'Escola sem nome cadastrado';
    var indicatorRows = indicators.indicadores || [];
    var fields = [
      ['Diretoria de Ensino / URE', school.diretoria],
      ['Município', school.municipio],
      ['Tipo de escola', school.tipo],
      ['Endereço', [details.LOGRADOURO, details.NUMERO, details.COMPLEMENTO].filter(Boolean).join(', ')],
      ['Bairro / Distrito', details.DISTRITO_BAIRRO],
      ['CEP', details.CEP],
      ['Zona', school.zona || details.ZONA],
      ['Telefone', school.telefones || details.TELEFONES],
      ['E-mail', school.email || details.EMAIL],
      ['Situação cadastral', details.SITUACAO_CADASTRAL],
      ['Última referência da fonte', details.DATA_REFERENCIA]
    ];

    schoolDetail.innerHTML = '<div class="school-detail-head"><div class="section-kicker">FICHA CADASTRAL · REDE ESTADUAL</div>' +
      '<h3>' + escapeHtml(name) + '</h3>' +
      '<div class="school-subtitle">' + escapeHtml(school.municipio) + (school.diretoria ? ' · ' + escapeHtml(school.diretoria) : '') + '</div>' +
      '<div class="school-codes"><span class="code-pill">CIE: ' + escapeHtml(school.cie || 'não informado na exportação') + '</span><span class="code-pill">INEP: ' + escapeHtml(school.codigoInep || 'não informado na exportação') + '</span><span class="code-pill">ID interno: ' + escapeHtml(school.idInterno) + '</span></div></div>' +
      '<div class="detail-grid">' + fields.map(function (f) { return field(f[0], f[1]); }).join('') + '</div>' +
      '<div class="indicator-block"><h4>Indicadores históricos</h4>' + renderIndicators(indicatorRows, school) + '</div>';
  }

  function renderIndicators(rows, school) {
    if (!rows.length) return '<div class="indicator-empty">Ainda não há indicadores históricos vinculados a esta unidade. Quando os arquivos oficiais de IDESP e IDEB forem importados, os resultados aparecerão aqui.</div>';
    var groups = {};
    rows.forEach(function (item) {
      var key = [item.INDICADOR || 'Indicador', item.ETAPA_ENSINO || 'Etapa não identificada', item.COMPONENTE_CURRICULAR || ''].join('|');
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return '<div class="indicator-groups">' + Object.keys(groups).map(function (key) {
      var group = groups[key].slice().sort(function (a,b) { return Number(a.ANO_REFERENCIA)-Number(b.ANO_REFERENCIA); });
      var first = group[0];
      var values = group.map(function (x) { return Number(String(x.VALOR).replace(',','.')); }).filter(function (x) { return isFinite(x); });
      var max = Math.max(10, Math.max.apply(null, values.concat([0])));
      var rowsHtml = group.map(function (item) {
        var val = Number(String(item.VALOR).replace(',','.'));
        var width = isFinite(val) ? Math.max(1, Math.min(100, (val / max) * 100)) : 0;
        return '<div class="indicator-chart-row"><span class="indicator-year">' + escapeHtml(item.ANO_REFERENCIA) + '</span><span class="indicator-track"><i style="width:' + width.toFixed(1) + '%"></i></span><strong>' + escapeHtml(item.VALOR) + '</strong></div>';
      }).join('');
      return '<section class="indicator-group"><div class="indicator-group-head"><strong>' + escapeHtml(first.INDICADOR) + '</strong><span>' + escapeHtml(first.ETAPA_ENSINO || 'Etapa não informada') + '</span></div>' + (first.COMPONENTE_CURRICULAR ? '<div class="indicator-component">' + escapeHtml(first.COMPONENTE_CURRICULAR) + '</div>' : '') + rowsHtml + '</section>';
    }).join('') + '</div><div class="indicator-footnote">Resultados conforme o arquivo oficial importado. Ausência de IDEB não significa nota zero: pode decorrer de critérios de participação ou divulgação. Verifique ano, etapa e metodologia antes de comparar séries diferentes.</div>';
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

  async function selectSchool(cie, inep, idInterno) {
    schoolDetail.innerHTML = '<div class="empty-state detail-empty"><span class="empty-icon">⋯</span><strong>Carregando ficha da escola</strong><p>Buscando cadastro e indicadores disponíveis.</p></div>';
    try {
      var id = cie || inep || idInterno;
      var type = cie ? 'cie' : (inep ? 'inep' : 'id');
      var results = await Promise.all([
        window.PortalAPI.obterEscola(id, type),
        window.PortalAPI.obterIndicadores(id, type)
      ]);
      renderSchool(results[0], results[1]);
      setApiState('online', 'Base conectada');
    } catch (error) {
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
  checkHealth();
})();
