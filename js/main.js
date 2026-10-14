import { PRETTY_PASTELS, catalogoFamilias, FAMILIAS_ALTAS, FAMILIAS_BAJAS, NUM_TRAMOS, TUBOS_X_TRAMO, mapaTiendaReal } from './data/constants.js';

let configBodega = { capacidades: { alta: 80, baja: 80 }, asignaciones: [], excluirPlayeraBasica: false };
let articulosGlobal = [];
let filtroUbicacion = 'todos';
let listaSurtido = []; 
let pedidosPendientes = []; 
let miTienda = { muebles: [] };
let eanToMueble = new Map();
let mVirtual = null;
let metricasFamilias = {};
let metricasSubfamilias = {};
let gruposPorSubfamilia = {}; 
let familiasSet = new Set();
let familiaActiva = null;
let subfamiliaActiva = null;

class Articulo { 
    constructor(grupo, ean, desc, stock, precio, almacen, fechaUE, modelo, color, talla, proveedor) { 
        this.grupo = grupo; this.ean = ean; this.descripcion = desc; this.stock = stock; 
        this.precio = precio; this.almacen = almacen; this.fechaUE = fechaUE; this.modelo = modelo; 
        this.color = color; this.talla = talla; this.proveedor = proveedor; 
    } 
}

class Mueble { 
    constructor(id, nombre, x, y, ancho, alto) { 
        this.id = id; this.nombre = nombre; this.x = x; this.y = y; this.ancho = ancho; this.alto = alto; this.articulos = []; 
    } 
    agregar(art) { this.articulos.push(art); } 
    obtenerColorVisual() { 
        if (this.articulos.length===0) return '#4b5563'; 
        if (this.articulos.some(a=>a.stock===0)) return '#e11d48'; 
        if (this.articulos.some(a=>a.stock>0 && a.stock<20)) return '#ea580c'; 
        return '#16a34a'; 
    } 
    contieneFiltro(familia,subfamilia,catalogo,locFilter) { 
        return this.articulos.some(art=>{ 
            let info=catalogo[art.grupo]; 
            if(!info) return false; 
            if(familia && info.familia!==familia) return false; 
            if(subfamilia && info.subfamilia!==subfamilia) return false; 
            if(locFilter==='piso' && art.almacen!=='A006') return false; 
            if(locFilter==='bodega' && art.almacen==='A006') return false; 
            return true; 
        }); 
    } 
}

function inicializarMuebles() { 
    let muebles=[], id=1; 
    eanToMueble.clear(); 
    for(let [ean,cfg] of Object.entries(mapaTiendaReal)){ 
        let m=new Mueble(id++,cfg.tipo,cfg.x,cfg.y,cfg.ancho,cfg.alto); 
        muebles.push(m); eanToMueble.set(ean,m); 
    } 
    mVirtual=new Mueble(id++,"📦 Almacén General",650,450,120,80); 
    mVirtual.articulos = [];
    muebles.push(mVirtual); miTienda.muebles=muebles; 
} 
inicializarMuebles();

function parseFechaUE(f){ 
    if(!f) return null; 
    let p=f.split('.'); 
    if(p.length===3) return new Date(p[2],p[1]-1,p[0]); 
    return null; 
}

//FUNCION PARA NORMALIZAR EL ESTILO BASE DE UN ARTICULO, ELIMINANDO SU TALLA Y COLOR este se tiene que cambiar no esta correcto
function normalizarEstiloBase(modelo) {
    if (!modelo) return "Estilo Sin Nombre";
    let limpio = modelo.trim();
    limpio = limpio.replace(/\s+[A-Z]$/i, "");
    limpio = limpio.replace(/\s+(MC|ML|M\/C|M\/L)$/i, "");
    return limpio.trim().toUpperCase();
}

function extraerDetalles(desc){ 
    if(!desc) return {modelo:"Sin descripción",color:"N/D",talla:"N/D"}; 
    let partes=desc.split(','); 
    if(partes.length>=3){ 
        let talla=partes[partes.length-2].trim().toUpperCase(), 
            color=partes[partes.length-1].trim().toUpperCase(), 
            modelo=partes.slice(0,partes.length-2).join(',').trim(); 
        return {modelo,color,talla}; 
    } 
    return {modelo:desc,color:"VARIOS",talla:"UNICA"}; 
}

function normalizarColumnas(filas){ 
    if(filas.length===0) return filas; 
    const primera=filas[0], claves=Object.keys(primera), mapeo={grupo:null,ean:null,descripcion:null,stock:null,precio:null,almacen:null,fechaUE:null,proveedor:null}; 
    for(let c of claves){ 
        let low=c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); 
        if(low.includes("grupo art")||low.includes("grupoart")) mapeo.grupo=c; 
        if(low.includes("ean")||low.includes("codigo")||low.includes("upc")) mapeo.ean=c; 
        if(low.includes("descripcion")||low.includes("descripci")) mapeo.descripcion=c; 
        if((low.includes("libre utiliz")||low.includes("libre"))&&!mapeo.stock) mapeo.stock=c; 
        if(low.includes("precio vta")||low.includes("precio")) mapeo.precio=c; 
        if(low === "alm."||low.includes("almacen")) mapeo.almacen=c; 
        if(low.includes("ue")||low.includes("fecha")) mapeo.fechaUE=c; 
        if(low.includes("proveedor")||low.includes("nombre")) mapeo.proveedor=c; 
    } 
    if(!mapeo.grupo&&claves[0]) mapeo.grupo=claves[0]; 
    if(!mapeo.ean&&claves[2]) mapeo.ean=claves[2]; 
    if(!mapeo.descripcion&&claves[3]) mapeo.descripcion=claves[3]; 
    if(!mapeo.stock&&claves[4]) mapeo.stock=claves[4]; 
    if(!mapeo.precio&&claves[7]) mapeo.precio=claves[7]; 
    if(!mapeo.almacen&&claves[6]) mapeo.almacen=claves[6]; 
    if(!mapeo.fechaUE&&claves[9]) mapeo.fechaUE=claves[9]; 
    if(!mapeo.proveedor&&claves[8]) mapeo.proveedor=claves[8]; 
    
    return filas.map(f=>({ 
        grupo:mapeo.grupo?f[mapeo.grupo]:null, 
        ean:mapeo.ean?String(f[mapeo.ean]||""):"", 
        descripcion:mapeo.descripcion?(f[mapeo.descripcion]||""):"", 
        stock:mapeo.stock?Number(f[mapeo.stock])||0:0, 
        precio:mapeo.precio?Number(f[mapeo.precio])||0:0, 
        almacen:mapeo.almacen?String(f[mapeo.almacen]||"").trim():"", 
        fechaUE:mapeo.fechaUE?f[mapeo.fechaUE]:"", 
        proveedor:mapeo.proveedor?String(f[mapeo.proveedor]||"").trim():"Proveedor no especificado" 
    })); 
}

function obtenerColorPastelFiel(texto) {
    if (!texto || texto === "Proveedor no especificado" || texto === "Vacío") {
        return { dot: '#cbd5e1', lightText: '#475569', darkText: '#94a3b8', bar: '#cbd5e1' };
    }
    let hash = 0;
    for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
    return PRETTY_PASTELS[Math.abs(hash) % PRETTY_PASTELS.length];
}

function getStockBodegaDisponible(ean) {
    let fisicoBodega = articulosGlobal.filter(a => a.ean === ean && a.almacen !== 'A006').reduce((s, a) => s + a.stock, 0);
    let apartadoCarrito = listaSurtido.filter(i => i.ean === ean).reduce((s, i) => s + i.cantidad, 0);
    let apartadoPedidos = pedidosPendientes.filter(p => p.estado === 'pendiente').reduce((total, p) => {
        return total + p.items.filter(i => i.ean === ean).reduce((s, i) => s + i.cantidad, 0);
    }, 0);
    return Math.max(0, fisicoBodega - apartadoCarrito - apartadoPedidos);
}

function reorganizarBodega() {
    let articulosAlta = []; let articulosBaja = [];
    articulosGlobal.forEach(art => {
        if (art.almacen === 'A006') return; 
        const info = catalogoFamilias[art.grupo];
        if (!info) return;
        if (configBodega.excluirPlayeraBasica && info.familia === 'PLAYERA' && info.subfamilia === 'PLAYERA BÁSICA') return;
        let clone = { ...art, modeloBase: normalizarEstiloBase(art.modelo), stockOriginal: art.stock, stockRestante: art.stock, familia: info.familia, subfamilia: info.subfamilia };
        if (FAMILIAS_ALTAS.includes(info.familia)) articulosAlta.push(clone);
        else if (FAMILIAS_BAJAS.includes(info.familia)) articulosBaja.push(clone);
        else articulosAlta.push(clone); 
    });

    const criterioOrden = (a, b) => {
        if (a.familia.localeCompare(b.familia) !== 0) return a.familia.localeCompare(b.familia);
        if (a.subfamilia.localeCompare(b.subfamilia) !== 0) return a.subfamilia.localeCompare(b.subfamilia);
        if (a.proveedor.localeCompare(b.proveedor) !== 0) return a.proveedor.localeCompare(b.proveedor);
        if (a.modeloBase.localeCompare(b.modeloBase) !== 0) return a.modeloBase.localeCompare(b.modeloBase);
        if (!a.fechaUE && !b.fechaUE) return 0;
        if (!a.fechaUE) return 1; if (!b.fechaUE) return -1;
        return a.fechaUE - b.fechaUE;
    };

    articulosAlta.sort(criterioOrden); articulosBaja.sort(criterioOrden);
    let asignaciones = [];
    for (let t = 1; t <= NUM_TRAMOS; t++) {
        for (let tubo = 1; tubo <= TUBOS_X_TRAMO; tubo++) {
            asignaciones.push({ tramo: t, tubo: tubo, tipo: (tubo <= 2) ? 'alta' : 'baja', familias: [], subfamilias: [], stockTotal: 0, items: [] });
        }
    }

    function distribuirTubos(articulos, tipo) {
        let tubos = asignaciones.filter(a => a.tipo === tipo);
        let idxTubo = 0; let cap = configBodega.capacidades[tipo] || 80; let familiaActual = "";

        articulos.forEach(art => {
            if (familiaActual !== "" && familiaActual !== art.familia && idxTubo < tubos.length && tubos[idxTubo].stockTotal > 0) idxTubo++;
            familiaActual = art.familia;
            while (art.stockRestante > 0 && idxTubo < tubos.length) {
                let tubo = tubos[idxTubo]; let espacio = cap - tubo.stockTotal;
                if (espacio <= 0) { idxTubo++; continue; }
                let asignado = Math.min(art.stockRestante, espacio);
                tubo.items.push({ ...art, stock: asignado });
                tubo.stockTotal += asignado; art.stockRestante -= asignado;
                if (!tubo.familias.includes(art.familia)) tubo.familias.push(art.familia);
                if (!tubo.subfamilias.includes(art.subfamilia)) tubo.subfamilias.push(art.subfamilia);
                if (tubo.stockTotal >= cap) idxTubo++;
            }
        });
    }

    distribuirTubos(articulosAlta, 'alta'); distribuirTubos(articulosBaja, 'baja');
    asignaciones.forEach(a => { if (a.familias.length === 0) { a.familias = ["Vacío"]; a.subfamilias = ["Estante Vacío"]; } });
    configBodega.asignaciones = asignaciones; guardarConfiguracion();
}

function recalcularMetricas() {
    metricasFamilias = {}; metricasSubfamilias = {}; gruposPorSubfamilia = {}; familiasSet.clear();

    for (let art of articulosGlobal) {
        const info = catalogoFamilias[art.grupo];
        if (!info) continue;
        if (configBodega.excluirPlayeraBasica && info.familia === 'PLAYERA' && info.subfamilia === 'PLAYERA BÁSICA' && art.almacen !== 'A006') continue;
        const familia = info.familia, subfamilia = info.subfamilia, stock = art.stock, precio = art.precio, esPiso = (art.almacen === 'A006');
        if (filtroUbicacion === 'piso' && !esPiso) continue; if (filtroUbicacion === 'bodega' && esPiso) continue;

        if (!metricasFamilias[familia]) metricasFamilias[familia] = { piezasTotal:0, pesosTotal:0, piezasPiso:0, pesosPiso:0, piezasBodega:0, pesosBodega:0, piezasNoExh:0, pesosNoExh:0, piezas90:0 };
        metricasFamilias[familia].piezasTotal += stock; metricasFamilias[familia].pesosTotal += stock * precio;
        if (esPiso) { metricasFamilias[familia].piezasPiso += stock; metricasFamilias[familia].pesosPiso += stock * precio; } 
        else { metricasFamilias[familia].piezasBodega += stock; metricasFamilias[familia].pesosBodega += stock * precio; }

        if (!metricasSubfamilias[familia]) metricasSubfamilias[familia] = {};
        if (!metricasSubfamilias[familia][subfamilia]) metricasSubfamilias[familia][subfamilia] = { piezasTotal:0, pesosTotal:0, piezasPiso:0, pesosPiso:0, piezasBodega:0, pesosBodega:0, piezasNoExh:0, pesosNoExh:0, piezas90:0 };
        const sub = metricasSubfamilias[familia][subfamilia];
        sub.piezasTotal += stock; sub.pesosTotal += stock * precio;
        if (esPiso) { sub.piezasPiso += stock; sub.pesosPiso += stock * precio; } 
        else { sub.piezasBodega += stock; sub.pesosBodega += stock * precio; }

        if (!gruposPorSubfamilia[familia]) gruposPorSubfamilia[familia] = {};
        if (!gruposPorSubfamilia[familia][subfamilia]) gruposPorSubfamilia[familia][subfamilia] = {};
        if (!gruposPorSubfamilia[familia][subfamilia][art.proveedor]) gruposPorSubfamilia[familia][subfamilia][art.proveedor] = [];
        
        let proveedorEstilos = gruposPorSubfamilia[familia][subfamilia][art.proveedor];
        let estilo = proveedorEstilos.find(e => e.modelo === art.modelo && e.color === art.color);
        if (!estilo) {
            estilo = { modelo: art.modelo, color: art.color, proveedor: art.proveedor, stockTotal: 0, stockPiso: 0, stockBodega: 0, fechaUltimaEntradaBodega: null, tallasInfo: {}, fechaMaxGeneral: null, pesosBodega: 0, familia: familia, subfamilia: subfamilia };
            proveedorEstilos.push(estilo);
        }
        estilo.stockTotal += stock;
        if (esPiso) estilo.stockPiso += stock;
        else {
            estilo.stockBodega += stock; estilo.pesosBodega += stock * precio;
            if (art.fechaUE && diasDesde(art.fechaUE) > UMBRALES.diasViejo) { metricasFamilias[familia].piezas90 += stock; sub.piezas90 += stock; }
            if (art.fechaUE && (!estilo.fechaUltimaEntradaBodega || art.fechaUE < estilo.fechaUltimaEntradaBodega)) estilo.fechaUltimaEntradaBodega = art.fechaUE;
        }
        if (art.fechaUE && (!estilo.fechaMaxGeneral || art.fechaUE > estilo.fechaMaxGeneral)) estilo.fechaMaxGeneral = art.fechaUE;

        if (!estilo.tallasInfo[art.talla]) estilo.tallasInfo[art.talla] = { ean: art.ean, stockPiso:0, stockBodega:0 };
        if (esPiso) estilo.tallasInfo[art.talla].stockPiso += stock; else estilo.tallasInfo[art.talla].stockBodega += stock;
        familiasSet.add(familia);
    }

    for (let fam in gruposPorSubfamilia) {
        for (let sub in gruposPorSubfamilia[fam]) {
            for (let prov in gruposPorSubfamilia[fam][sub]) {
                let estilos = gruposPorSubfamilia[fam][sub][prov];
                estilos.forEach(e => { if (e.stockBodega > 0 && e.stockPiso === 0) { for (const m of [metricasFamilias[fam], metricasSubfamilias[fam][sub]]) { m.piezasNoExh += e.stockBodega; m.pesosNoExh += e.pesosBodega; } } });
                estilos.sort((a,b) => {
                    if ((a.stockBodega > 0) !== (b.stockBodega > 0)) return (a.stockBodega > 0) ? -1 : 1;
                    if (a.stockBodega > 0 && b.stockBodega > 0) {
                        if (!a.fechaUltimaEntradaBodega && !b.fechaUltimaEntradaBodega) return 0;
                        if (!a.fechaUltimaEntradaBodega) return 1; if (!b.fechaUltimaEntradaBodega) return -1;
                        return a.fechaUltimaEntradaBodega - b.fechaUltimaEntradaBodega;
                    }
                    return (a.modelo + a.color).localeCompare(b.modelo + b.color);
                });
            }
        }
    }
}


// ---------- SEMÁFOROS Y TARJETAS COMPACTAS ----------
const UMBRALES = { diasViejo: 90, noExhAmarillo: 10, noExhRojo: 25, viejoAmarillo: 20, viejoRojo: 40 }; // % sobre piezas
function diasDesde(f) { return (Date.now() - f.getTime()) / 86400000; }
function fmtPesos(n) { n = n || 0; if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K'; return '$' + Math.round(n); }
function pct(a, b) { return b > 0 ? (a / b) * 100 : 0; }

function evaluarSemaforo(d) {
    const pNoExh = pct(d.piezasNoExh || 0, d.piezasTotal), pViejo = pct(d.piezas90 || 0, d.piezasBodega);
    let nivel = 'verde';
    if (pNoExh >= UMBRALES.noExhRojo || pViejo >= UMBRALES.viejoRojo) nivel = 'rojo';
    else if (pNoExh >= UMBRALES.noExhAmarillo || pViejo >= UMBRALES.viejoAmarillo) nivel = 'amarillo';
    return { nivel, pNoExh, pViejo };
}

function tarjetaMetricasHTML(titulo, d, esConsolidado) {
    const ver = filtroUbicacion === 'todos', sem = ver ? evaluarSemaforo(d) : { nivel: 'neutro', pNoExh: 0, pViejo: 0 };
    const pPiso = pct(d.piezasPiso, d.piezasTotal), pBod = pct(d.piezasBodega, d.piezasTotal);
    const chips = [];
    if (ver && d.piezasNoExh > 0) chips.push(`<span class="chip chip-noexh" title="Mercancía solo en bodega, sin exhibir">No exhibido ${d.piezasNoExh} · ${Math.round(sem.pNoExh)}%</span>`);
    if (ver && d.piezas90 > 0) chips.push(`<span class="chip chip-viejo" title="Piezas en bodega con más de ${UMBRALES.diasViejo} días">+${UMBRALES.diasViejo}d ${d.piezas90}</span>`);
    const barra = ver ? `<div class="mini-barra"><i class="b-piso" style="width:${pPiso.toFixed(1)}%"></i><i class="b-bod" style="width:${pBod.toFixed(1)}%"></i></div>` : `<div class="mini-barra"><i class="${filtroUbicacion === 'piso' ? 'b-piso' : 'b-bod'}" style="width:100%"></i></div>`;
    const filaPiso = `<span class="ub-piso"><i class="fas fa-store"></i> ${d.piezasPiso.toLocaleString()} <small>${fmtPesos(d.pesosPiso)}</small></span>`;
    const filaBod = `<span class="ub-bod"><i class="fas fa-warehouse"></i> ${d.piezasBodega.toLocaleString()} <small>${fmtPesos(d.pesosBodega)}</small></span>`;
    const ubic = filtroUbicacion === 'piso' ? filaPiso : (filtroUbicacion === 'bodega' ? filaBod : filaPiso + filaBod);
    return `<div class="t-top"><span class="semaforo sem-${sem.nivel}"></span><span class="t-nombre" title="${titulo}">${titulo}</span></div>
        <div class="t-total"><b>${d.piezasTotal.toLocaleString()}</b> pzs <span>${fmtPesos(d.pesosTotal)}</span></div>
        ${barra}<div class="t-ubic">${ubic}</div>${chips.length ? `<div class="t-chips">${chips.join('')}</div>` : ''}`;
}

function renderizarFamilias() {
    const container = document.getElementById('familiasCarrusel'); container.innerHTML = '';
    let totalNoExh = 0, totalViejo = 0, totalPzs = 0, totalPesos = 0, totalPisoPzs = 0, totalBodegaPzs = 0, totalPisoPes = 0, totalBodegaPes = 0;
    Object.values(metricasFamilias).forEach(m => {
        totalNoExh += m.piezasNoExh; totalViejo += m.piezas90;
        totalPzs += m.piezasTotal; totalPesos += m.pesosTotal; totalPisoPzs += m.piezasPiso; totalBodegaPzs += m.piezasBodega; totalPisoPes += m.pesosPiso; totalBodegaPes += m.pesosBodega;
    });

    const familiasOrden = ["TODOS", ...Array.from(familiasSet).sort()];
    familiasOrden.forEach(fam => {
        let data = fam === "TODOS" ? { piezasNoExh: totalNoExh, pesosNoExh: 0, piezas90: totalViejo, piezasTotal: totalPzs, pesosTotal: totalPesos, piezasPiso: totalPisoPzs, piezasBodega: totalBodegaPzs, pesosPiso: totalPisoPes, pesosBodega: totalBodegaPes } : metricasFamilias[fam] || { piezasTotal:0, pesosTotal:0, piezasPiso:0, piezasBodega:0, pesosPiso:0, pesosBodega:0 };
        data = { piezasNoExh: 0, pesosNoExh: 0, piezas90: 0, ...data };
        const wrapper = document.createElement('div'); wrapper.className = 'carrusel-item';
        const tarj = document.createElement('button'); tarj.type = 'button'; tarj.className = 'tarjeta-mini' + (fam === familiaActiva || (fam === 'TODOS' && !familiaActiva) ? ' activa' : '');
        tarj.innerHTML = tarjetaMetricasHTML(fam === 'TODOS' ? 'Todas' : fam, data, fam === 'TODOS');
        tarj.onclick = () => {
            if (fam === "TODOS") { familiaActiva = null; subfamiliaActiva = null; ocultarSubfamilias(); ocultarProveedores(); }
            else { familiaActiva = fam; subfamiliaActiva = null; mostrarSubfamilias(fam); ocultarProveedores(); }
            renderizarFamilias(); dibujarCanvas();
        };
        wrapper.appendChild(tarj); container.appendChild(wrapper);
    });
}

function ocultarSubfamilias() { document.getElementById('subfamiliasContainer').style.display = 'none'; document.getElementById('subfamiliasGrid').innerHTML = ''; subfamiliaActiva = null; }

function mostrarSubfamilias(familia) {
    document.getElementById('familiaLabelTitle').innerText = familia;
    const subfamMap = metricasSubfamilias[familia] || {}; const subfamilias = Object.keys(subfamMap).sort();
    const container = document.getElementById('subfamiliasGrid'); container.innerHTML = '';
    if (subfamilias.length === 0) { container.innerHTML = '<div class="text-slate-500 font-bold p-4 text-center col-span-3">Sin subfamilias</div>'; }
    else {
        subfamilias.forEach(sub => {
            const data = subfamMap[sub];
            const tarj = document.createElement('button'); tarj.type = 'button'; tarj.className = 'tarjeta-mini' + (sub === subfamiliaActiva ? ' activa' : '');
            tarj.innerHTML = tarjetaMetricasHTML(sub, data, false);
            tarj.onclick = () => { subfamiliaActiva = sub; mostrarSubfamilias(familia); mostrarProveedores(familia, sub); dibujarCanvas(); };
            container.appendChild(tarj);
        });
    }
    document.getElementById('subfamiliasContainer').style.display = 'block';
}

function ocultarProveedores() { document.getElementById('proveedoresContainer').style.display = 'none'; document.getElementById('proveedoresGrid').innerHTML = ''; }

function mostrarProveedores(familia, subfamilia) {
    const proveedoresMap = (gruposPorSubfamilia[familia] && gruposPorSubfamilia[familia][subfamilia]) || {};
    const proveedores = Object.keys(proveedoresMap).sort();
    const container = document.getElementById('proveedoresGrid'); container.innerHTML = '';
    if (proveedores.length === 0) { container.innerHTML = '<div class="text-slate-500 font-bold p-4 text-center">No hay estilos para esta subfamilia</div>'; document.getElementById('proveedoresContainer').style.display = 'block'; return; }

    proveedores.forEach(prov => {
        const estilos = proveedoresMap[prov], block = document.createElement('div'); block.className = 'proveedor-block';
        let provColor = obtenerColorPastelFiel(prov);
        const header = document.createElement('div'); header.className = 'proveedor-header';
        header.innerHTML = `<span class="flex items-center gap-2"><span class="w-3.5 h-3.5 rounded-full" style="background: ${provColor.dot}"></span><i class="fas fa-building text-slate-400"></i> ${prov}</span><i class="fas fa-chevron-down text-xs"></i>`;
        const carrusel = document.createElement('div'); carrusel.className = 'estilos-carrusel';
        
        estilos.forEach(estilo => {
            const badges = [];
            if (estilo.stockTotal === 1) badges.push('<span class="badge badge-pieza-unica"><i class="fas fa-exclamation-triangle"></i> Única</span>');
            if (estilo.fechaMaxGeneral && (new Date() - estilo.fechaMaxGeneral) / (1000*60*60*24) > 90) badges.push('<span class="badge badge-viejo"><i class="fas fa-clock"></i> +90 días</span>');
            if (estilo.stockPiso === 0 && estilo.stockTotal > 0) badges.push('<span class="badge badge-sin-piso"><i class="fas fa-warehouse"></i> Solo bodega</span>');
            const badgeHtml = badges.length ? `<div class="flex flex-wrap gap-1.5 mt-2">${badges.join(' ')}</div>` : '';
            let fechaHtml = ''; if (estilo.stockBodega > 0 && estilo.fechaUltimaEntradaBodega) fechaHtml = `<div class="text-[0.68rem] text-slate-500 font-semibold mt-1"><i class="fas fa-calendar-alt"></i> F.U.E Bodega: ${estilo.fechaUltimaEntradaBodega.toLocaleDateString('es-ES')}</div>`;
            const tallasKeys = Object.keys(estilo.tallasInfo).sort();
            let tablaHtml = '';
            if (tallasKeys.length > 0) {
                tablaHtml = `<table class="tabla-tallas text-slate-800 dark:text-slate-100"><thead><tr><th>Talla</th><th><i class="fas fa-store"></i> Piso</th><th><i class="fas fa-warehouse"></i> Disponible</th><th>Pedir</th></tr></thead><tbody>`;
                tallasKeys.forEach(talla => {
                    const info = estilo.tallasInfo[talla], ean = info.ean, descCompleta = `${estilo.modelo} - ${estilo.color} (${talla})`;
                    let dispReal = getStockBodegaDisponible(ean);
                    tablaHtml += `<tr><td class="font-bold">${talla}</td><td>${info.stockPiso}</td><td class="font-bold text-sky-500">${dispReal}</td><td><div class="flex items-center justify-center gap-1.5"><input type="number" min="0" max="${dispReal}" value="0" class="input-cantidad" id="cant-${ean}" ${dispReal===0?'disabled':''}><button class="btn-surtir" data-ean="${ean}" data-desc="${descCompleta}" data-fam="${familia}" data-sub="${subfamilia}" ${dispReal===0?'disabled':''}><i class="fas fa-plus"></i></button></div></td></tr>`;
                });
                tablaHtml += `</tbody></table>`;
            }
            const tarj = document.createElement('div'); tarj.className = 'tarjeta-estilo-analitica p-4';
            tarj.innerHTML = `<div class="estilo-header"><div class="estilo-nombre uppercase">${estilo.modelo} - ${estilo.color}</div><div class="text-xs font-semibold text-slate-500 mt-1">Total Físico: ${estilo.stockTotal} | Piso: ${estilo.stockPiso} | Bodega: ${estilo.stockBodega}</div>${badgeHtml}${fechaHtml}</div>${tablaHtml}`;
            carrusel.appendChild(tarj);
        });

        block.appendChild(header); block.appendChild(carrusel);
        let collapsed = false;
        header.addEventListener('click', () => { collapsed = !collapsed; if (collapsed) { carrusel.classList.add('collapsed'); header.classList.add('collapsed'); } else { carrusel.classList.remove('collapsed'); header.classList.remove('collapsed'); } });
        container.appendChild(block);
    });
    document.getElementById('proveedoresContainer').style.display = 'block';
}

function agregarAlCarrito(ean, descripcion, cantidad, familia, subfamilia) {
    if (cantidad <= 0) return showToast("Ingresa una cantidad mayor a cero", "error");
    let disponible = getStockBodegaDisponible(ean);
    if (cantidad > disponible) return showToast(`Solo tienes ${disponible} unidades disponibles.`, "error");
    let existente = listaSurtido.find(i => i.ean === ean);
    if (existente) existente.cantidad += cantidad;
    else listaSurtido.push({ ean: ean, descripcion: descripcion, cantidad: cantidad, familia: familia, subfamilia: subfamilia });
    actualizarPanelCarrito();
    if (familiaActiva && subfamiliaActiva) mostrarProveedores(familiaActiva, subfamiliaActiva);
    showToast("Agregado a la cesta de solicitud", "success");
}

function actualizarPanelCarrito() {
    let countSpan = document.getElementById('surtidoCount'), listaDiv = document.getElementById('surtidoLista'); countSpan.innerText = listaSurtido.length;
    if (listaSurtido.length === 0){ listaDiv.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs font-semibold">Cesta vacía</div>'; return; }
    let html = '<table class="surtido-tabla text-xs text-slate-800 dark:text-slate-100"><thead><tr><th>EAN</th><th>Descripción</th><th>Cant</th><th></th></tr></thead><tbody>';
    listaSurtido.forEach((item, idx) => { html += `<tr><td><code>${item.ean}</code></td><td class="font-semibold">${item.descripcion}</td><td class="font-bold text-sky-600">${item.cantidad}</td><td class="text-center"><button class="text-rose-500 hover:text-rose-700" onclick="window.eliminarDelCarrito(${idx})"><i class="fas fa-trash"></i></button></td></tr>`; });
    html += `</tbody></table>`; listaDiv.innerHTML = html;
}

window.eliminarDelCarrito = function(idx) {
    listaSurtido.splice(idx, 1); actualizarPanelCarrito();
    if (familiaActiva && subfamiliaActiva) mostrarProveedores(familiaActiva, subfamiliaActiva);
}

function actualizarBandejaPedidosBodega() {
    let container = document.getElementById('bandejaPedidosContainer'), pendientes = pedidosPendientes.filter(p => p.estado === 'pendiente');
    if (pendientes.length === 0) { container.innerHTML = '<div class="text-center text-slate-500 text-xs py-8"><i class="fas fa-check-circle text-2xl mb-2 block"></i> Sin pedidos pendientes.</div>'; return; }
    let html = '';
    pendientes.forEach(p => {
        let totalPzas = p.items.reduce((s,i) => s + i.cantidad, 0), etaStr = p.eta.toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'});
        let itemsHtml = p.items.map(i => {
                    // 1. Buscamos en qué Tramos y Tubos físicos está guardado este EAN
                    let tubosEncontrados = configBodega.asignaciones.filter(a => a.items.some(it => it.ean === i.ean));
                    
                    // 2. Creamos las etiquetas visuales para la ubicación
                    let ubicacionTexto = tubosEncontrados.length > 0 
                        ? tubosEncontrados.map(t => `<span class="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-700 dark:text-slate-300">Tramo ${t.tramo} - Tubo ${t.tubo}</span>`).join(' ') 
                        : `<span class="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-bold">Piso de Venta</span>`;

                    // 3. Construimos el nuevo diseño del item en el pedido
                    return `
                        <div class="text-[10px] text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 py-2 flex flex-col gap-1.5">
                            <div class="flex justify-between items-start">
                                <div class="font-bold text-slate-800 dark:text-slate-200 flex flex-col">
                                    <span class="text-[11px] font-mono text-sky-600 dark:text-sky-400">${i.ean}</span>
                                </div>
                                <span class="font-black text-emerald-500 text-xs">${i.cantidad} u.</span>
                            </div>
                            <div class="font-semibold leading-tight">${i.descripcion}</div>
                            <div class="flex flex-wrap gap-1 mt-0.5">
                                <i class="fas fa-map-marker-alt text-slate-400 mt-0.5"></i> ${ubicacionTexto}
                            </div>
                        </div>
                    `;
                }).join('');        
        html += `<div class="pedido-card border-l-4 border-l-sky-500 relative"><div class="flex justify-between items-start mb-2"><div><span class="text-xs font-black text-slate-800 dark:text-white">${p.id}</span><div class="text-[10px] text-slate-500">${p.fecha.toLocaleTimeString()}</div></div><div class="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded"><i class="fas fa-stopwatch"></i> ETA: ${etaStr}</div></div><div class="mb-3 max-h-[100px] overflow-y-auto pr-1">${itemsHtml}</div><button class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 rounded-lg transition-colors shadow" onclick="window.surtirPedidoReal('${p.id}')"><i class="fas fa-box-open mr-1"></i> Marcar como Surtido</button></div>`;
    });
    container.innerHTML = html;
}

window.surtirPedidoReal = function(idPedido) {
    let pedido = pedidosPendientes.find(p => p.id === idPedido);
    if (!pedido || pedido.estado !== 'pendiente') return;
    pedido.items.forEach(itemPedido => {
        let remanente = itemPedido.cantidad, tubosConEan = configBodega.asignaciones.filter(asig => asig.items.some(i => i.ean === itemPedido.ean));
        tubosConEan.sort((a, b) => {
            let iA = a.items.find(i => i.ean === itemPedido.ean), iB = b.items.find(i => i.ean === itemPedido.ean);
            if (!iA.fechaUE) return 1; if (!iB.fechaUE) return -1;
            return iA.fechaUE - iB.fechaUE;
        });
        for (let tubo of tubosConEan) {
            if (remanente <= 0) break;
            let itemEnTubo = tubo.items.find(i => i.ean === itemPedido.ean);
            if (itemEnTubo) {
                let aTomar = Math.min(itemEnTubo.stock, remanente);
                itemEnTubo.stock -= aTomar; tubo.stockTotal -= aTomar; remanente -= aTomar;
                tubo.items = tubo.items.filter(i => i.stock > 0);
                if (tubo.items.length === 0) { tubo.familias = ["Vacío"]; tubo.subfamilias = ["Estante Vacío"]; }
            }
        }
        let pzasDescontarGlobal = itemPedido.cantidad;
        for (let art of articulosGlobal) {
            if (pzasDescontarGlobal <= 0) break;
            if (art.ean === itemPedido.ean && art.almacen !== 'A006') {
                let tomarGlo = Math.min(art.stock, pzasDescontarGlobal);
                art.stock -= tomarGlo; pzasDescontarGlobal -= tomarGlo;
            }
        }
        let artPiso = articulosGlobal.find(a => a.ean === itemPedido.ean && a.almacen === 'A006');
        if (artPiso) artPiso.stock += itemPedido.cantidad;
    });
    pedido.estado = 'surtido'; guardarConfiguracion(); recalcularMetricas(); renderizarFamilias();
    if (familiaActiva && subfamiliaActiva) mostrarProveedores(familiaActiva, subfamiliaActiva);
    actualizarBandejaPedidosBodega(); actualizarLayoutBodega(); actualizarStats(); dibujarCanvas();
    showToast(`Pedido ${idPedido} surtido y movido al piso de venta.`, "success");
}

function actualizarStats(){
    let totalStock = articulosGlobal.filter(a => a.almacen !== 'A006').reduce((s,a)=>s+a.stock,0), capAlta = configBodega.capacidades.alta || 80, capBaja = configBodega.capacidades.baja || 80;
    let capacidadTotal = (18 * capAlta) + (18 * capBaja), ocupacion = capacidadTotal > 0 ? (totalStock / capacidadTotal) * 100 : 0;
    document.getElementById('statsBar').innerHTML = `<span><i class="fas fa-boxes text-sky-500"></i> Stock Físico (Bodega): ${totalStock.toLocaleString()}</span> <span><i class="fas fa-cubes text-emerald-500"></i> Capacidad Máxima: ${capacidadTotal.toLocaleString()}</span> <span><i class="fas fa-percentage text-amber-500"></i> Ocupación: ${ocupacion.toFixed(1)}%</span>`;
}

function guardarConfiguracion(){ localStorage.setItem('bodega_config_v3', JSON.stringify(configBodega)); }
function cargarConfiguracion(){ let saved=localStorage.getItem('bodega_config_v3'); if(saved) configBodega=JSON.parse(saved); else configBodega.capacidades = { alta: 80, baja: 80 }; }

function actualizarLayoutBodega(){
    const grid = document.getElementById('tramosGrid'); grid.innerHTML = '';
    const isDark = document.documentElement.classList.contains('dark'), searchQuery = document.getElementById('quickSearchInput').value.trim().toLowerCase();
    for (let t = 1; t <= NUM_TRAMOS; t++){
        let tramoDiv = document.createElement('div'); tramoDiv.className = 'tramo-card border border-slate-200/50 dark:border-slate-800'; tramoDiv.innerHTML = `<div class="tramo-header">Tramo ${t}</div>`;
        for (let tubo = 1; tubo <= TUBOS_X_TRAMO; tubo++){
            let asign = configBodega.asignaciones.find(a => a.tramo === t && a.tubo === tubo);
            if (!asign) continue;
            let tipo = asign.tipo, familiasLabel = asign.familias.join(' + '), subfamiliasLabel = asign.subfamilias.slice(0, 2).join(', ') + (asign.subfamilias.length > 2 ? '...' : '');
            let stock = asign.stockTotal, capacidad = configBodega.capacidades[tipo] || 80, porcentaje = capacidad > 0 ? Math.min(100, (stock / capacidad) * 100) : 0;
            let proveedorDominante = "Vacío", earliestDate = null;
            if (asign.items && asign.items.length > 0) { proveedorDominante = asign.items[0].proveedor; let dates = asign.items.map(i => i.fechaUE).filter(d => d !== null); if (dates.length > 0) earliestDate = new Date(Math.min.apply(null, dates)); }
            let colorPastelObj = obtenerColorPastelFiel(proveedorDominante), textCol = isDark ? colorPastelObj.darkText : colorPastelObj.lightText, fueStr = "N/D", esPEPSCritico = false;
            if (earliestDate) { fueStr = `${earliestDate.getDate()}/${earliestDate.getMonth() + 1}`; esPEPSCritico = (new Date() - earliestDate) / (1000 * 60 * 60 * 24) > 90; }
            let coincideBusqueda = true; if (searchQuery !== "") { let txtBuscar = (proveedorDominante + " " + familiasLabel + " " + subfamiliasLabel).toLowerCase(); if (!txtBuscar.includes(searchQuery)) coincideBusqueda = false; }
            let tuboDiv = document.createElement('div'); tuboDiv.className = `tubo`;
            if (!coincideBusqueda) { tuboDiv.style.opacity = "0.2"; tuboDiv.style.filter = "grayscale(60%)"; }
            tuboDiv.innerHTML = `<div class="tubo-nombre"><span class="font-bold text-slate-500 dark:text-slate-400"><i class="fas fa-${tipo==='alta'?'arrow-up':'arrow-down'} text-[10px]"></i> Tubo ${tubo}</span><span class="text-xs font-bold text-slate-600 dark:text-slate-300">${stock}/${capacidad}</span></div><div class="flex items-center gap-1.5 my-1"><span class="w-2.5 h-2.5 rounded-full" style="background: ${colorPastelObj.dot};"></span><span class="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate uppercase" title="${familiasLabel}">${familiasLabel}</span></div><div class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate mb-1" title="${subfamiliasLabel}">${subfamiliasLabel}</div><div class="flex items-center justify-between gap-1 my-1.5"><span class="text-[9px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1" style="background: rgba(100,116,139,0.08); color: ${textCol};"><i class="far fa-clock"></i> F.U.E: ${fueStr}</span>${esPEPSCritico ? `<span class="text-[9px] font-black bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full animate-pulse">PEPS</span>` : ''}</div><div class="barra-progreso"><div class="barra-llenado" style="width: ${porcentaje}%; background: ${colorPastelObj.dot};"></div></div>`;
            tuboDiv.addEventListener('click', () => mostrarDetalleTubo(t, tubo)); tramoDiv.appendChild(tuboDiv);
        }
        grid.appendChild(tramoDiv);
    }
}

function mostrarDetalleTubo(tramo, tubo) {
    let asign = configBodega.asignaciones.find(a => a.tramo === tramo && a.tubo === tubo);
    if (!asign) return;
    let containerRockola = document.getElementById('rockolaEstilosContenedor');
    if (!asign.items || asign.items.length === 0) { containerRockola.innerHTML = '<div class="w-full text-center py-16 text-slate-500 font-bold text-sm">Este tubo está vacío.</div>'; document.getElementById('modalTubo').classList.add('visible'); return; }
    let estilosMap = {};
    asign.items.forEach(item => { let key = `${item.modeloBase}|${item.color}`; if (!estilosMap[key]) { estilosMap[key] = { modeloBase: item.modeloBase, color: item.color, proveedor: item.proveedor, fechaUE: item.fechaUE, articulos: [] }; } estilosMap[key].articulos.push(item); });
    let htmlRockola = '';
    Object.values(estilosMap).forEach(estilo => {
        let colorPastel = obtenerColorPastelFiel(estilo.proveedor);
        let eansHtml = estilo.articulos.map(item => `<div class="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 mb-2 flex justify-between items-center"><div><span class="text-xs text-sky-600 dark:text-sky-400 font-bold">Talla ${item.talla}</span> <span class="text-[10px] text-slate-500 block">${item.ean}</span></div><span class="text-sm font-extrabold text-slate-800 dark:text-white">${item.stock} u.</span></div>`).join('');
        htmlRockola += `<div class="rockola-card bg-slate-50 dark:bg-slate-900/90 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-lg"><span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md text-white/95 uppercase mb-2 inline-block" style="background: ${colorPastel.dot};">${estilo.proveedor}</span><h5 class="text-sm font-black text-slate-800 dark:text-white truncate">${estilo.modeloBase}</h5><p class="text-xs text-slate-500 font-semibold mb-3">Color: ${estilo.color}</p><div class="max-h-[150px] overflow-y-auto mb-3">${eansHtml}</div></div>`;
    });
    containerRockola.innerHTML = htmlRockola; document.getElementById('modalTubo').classList.add('visible');
}

function dibujarCanvas(){ 
    let canvas = document.getElementById('planoTienda'), ctx = canvas.getContext('2d'); 
    canvas.width = 800; canvas.height = 600; ctx.clearRect(0, 0, 800, 600); 
    let rect = canvas.getBoundingClientRect(), scale = Math.min(rect.width / 800, rect.height / 600, 1); 
    canvas.style.width = `${800 * scale}px`; canvas.style.height = `${600 * scale}px`; 
    let finalScale = canvas.getBoundingClientRect().width / 800; 
    ctx.save(); ctx.scale(finalScale, finalScale); 
    const isDark = document.documentElement.classList.contains('dark');
    miTienda.muebles.forEach(m => { 
        let coincide = m.contieneFiltro(familiaActiva, subfamiliaActiva, catalogoFamilias, filtroUbicacion); 
        if (!coincide){ ctx.fillStyle = isDark ? '#1f2937' : '#e2e8f0'; ctx.globalAlpha = 0.35; } else { ctx.fillStyle = m.obtenerColorVisual(); ctx.globalAlpha = 1; } 
        ctx.fillRect(m.x, m.y, m.ancho, m.alto); ctx.strokeStyle = isDark ? '#4b5563' : '#94a3b8'; ctx.strokeRect(m.x, m.y, m.ancho, m.alto); 
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px "Inter", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.nombre, m.x + m.ancho / 2, m.y + 20); 
        let totalStock = m.articulos.reduce((s, a) => s + a.stock, 0); ctx.font = 'bold 12px monospace'; ctx.fillText(`📦 ${totalStock}`, m.x + m.ancho / 2, m.y + 45); 
    }); 
    ctx.restore(); 
}

function actualizarVistaPorFiltro(){ 
    let bodegaDiv = document.getElementById('bodegaLayout'), canvasWrap = document.getElementById('canvasWrapper'), analiticoFam = document.getElementById('analiticoFamiliasSection'); 
    if (filtroUbicacion === 'bodega'){ 
        bodegaDiv.style.display = 'block'; canvasWrap.classList.remove('visible'); analiticoFam.style.display = 'none';
        ocultarSubfamilias(); ocultarProveedores(); actualizarLayoutBodega(); actualizarStats(); actualizarBandejaPedidosBodega(); document.getElementById('searchContainer').classList.remove('hidden');
    } else { 
        bodegaDiv.style.display = 'none'; canvasWrap.classList.add('visible'); analiticoFam.style.display = 'block'; document.getElementById('searchContainer').classList.add('hidden');
        recalcularMetricas(); renderizarFamilias();
        if (familiaActiva) mostrarSubfamilias(familiaActiva); if (familiaActiva && subfamiliaActiva) mostrarProveedores(familiaActiva, subfamiliaActiva);
        dibujarCanvas(); 
    } 
}

async function procesarExcel() {
    const file = document.getElementById('inputExcel').files[0]; 
    if (!file) return showToast("Selecciona un archivo de inventario", "error"); 
    const btn = document.getElementById('magicProcessBtn'), original = btn.innerHTML; 
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Procesando...'; btn.disabled = true;
    try { 
        const data = await file.arrayBuffer(), workbook = XLSX.read(data), hoja = workbook.Sheets[workbook.SheetNames[0]]; 
        let filasRaw = XLSX.utils.sheet_to_json(hoja, {defval:"", blankrows:false, raw:false}); 
        filasRaw = filasRaw.filter(row => !Object.values(row).some(v => typeof v === 'string' && (v.includes("Grupo art") || v.includes("Material")))); 
        const filasNorm = normalizarColumnas(filasRaw); 
        miTienda.muebles.forEach(m => m.articulos = []); articulosGlobal = []; 
        for (let f of filasNorm){ 
            let grupo = f.grupo; if (!grupo || isNaN(Number(grupo))) continue; 
            let stock = Number(f.stock) || 0; if (stock === 0) continue; 
            let precio = Number(f.precio) || 0, ean = String(f.ean || "").trim(), desc = String(f.descripcion || "").trim(), almacen = String(f.almacen || "").trim(), fechaUE = parseFechaUE(f.fechaUE), proveedor = String(f.proveedor || "Proveedor no especificado").trim(); 
            const info = catalogoFamilias[grupo]; if (!info) continue; 
            const {modelo, color, talla} = extraerDetalles(desc); 
            articulosGlobal.push(new Articulo(grupo, ean, desc, stock, precio, almacen, fechaUE, modelo, color, talla, proveedor)); 
            const mueble = eanToMueble.get(ean); 
            if (mueble) mueble.agregar(articulosGlobal[articulosGlobal.length - 1]); else mVirtual.agregar(articulosGlobal[articulosGlobal.length - 1]); 
        } 
        document.getElementById('welcomeScreen').style.display = 'none'; document.getElementById('mainContent').style.display = 'block'; document.getElementById('viewFilters').classList.remove('hidden');
        reorganizarBodega(); recalcularMetricas(); renderizarFamilias(); actualizarLayoutBodega(); dibujarCanvas(); actualizarStats(); 
        showToast(`✅ Procesado con éxito.`, "success"); 
    } catch (err){ showToast("Error: " + err.message, "error"); } finally { btn.innerHTML = original; btn.disabled = false; } 
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer'), card = document.createElement('div'); card.className = `toast-card ${type}`;
    card.innerHTML = `${type === 'success' ? '<i class="fas fa-check-circle"></i>' : (type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-info-circle"></i>')} <span>${message}</span>`;
    container.appendChild(card); setTimeout(() => card.classList.add('show'), 10); setTimeout(() => { card.classList.remove('show'); setTimeout(() => card.remove(), 300); }, 3500);
}

// EVENT LISTENERS (EL PUENTE)
document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); document.getElementById('themeText').innerText = "Modo Oscuro"; }
    else { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); document.getElementById('themeText').innerText = "Modo Claro"; }
    dibujarCanvas(); actualizarLayoutBodega(); 
});

document.getElementById('cerrarSubfamiliasBtn').addEventListener('click', () => { familiaActiva = null; renderizarFamilias(); ocultarSubfamilias(); ocultarProveedores(); dibujarCanvas(); });
document.getElementById('magicProcessBtn').addEventListener('click', procesarExcel);
document.getElementById('inputExcel').addEventListener('change', e => document.getElementById('fileName').innerText = e.target.files[0]?.name || "Ningún archivo");
document.getElementById('reorganizarBtn').addEventListener('click', () => { reorganizarBodega(); actualizarLayoutBodega(); actualizarStats(); showToast("Estantería de bodega re-cubicada por PEPS.", "success"); });
document.getElementById('toggleExcluirBtn').addEventListener('click', () => { configBodega.excluirPlayeraBasica = !configBodega.excluirPlayeraBasica; guardarConfiguracion(); if (articulosGlobal.length) { reorganizarBodega(); recalcularMetricas(); renderizarFamilias(); if (familiaActiva && subfamiliaActiva) mostrarProveedores(familiaActiva, subfamiliaActiva); } actualizarLayoutBodega(); actualizarStats(); document.getElementById('exclusionBadge').style.display = configBodega.excluirPlayeraBasica ? 'inline-flex' : 'none'; });
document.getElementById('cerrarModalBtn').addEventListener('click', () => document.getElementById('modalTubo').classList.remove('visible'));
document.querySelectorAll('.loc-btn').forEach(btn => { btn.addEventListener('click', () => { document.querySelectorAll('.loc-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); filtroUbicacion = btn.getAttribute('data-loc'); actualizarVistaPorFiltro(); }); });
document.getElementById('surtidoToggle').addEventListener('click', () => { document.getElementById('surtidoContenido').classList.toggle('visible'); document.getElementById('iconToggleSurtido').classList.toggle('rotate-180'); });
document.getElementById('quickSearchInput').addEventListener('input', () => { if (filtroUbicacion === 'bodega') actualizarLayoutBodega(); });
document.addEventListener('click', function(e) { let btn = e.target.closest('.btn-surtir'); if (btn) { const ean = btn.getAttribute('data-ean'), desc = btn.getAttribute('data-desc'), fam = btn.getAttribute('data-fam'), sub = btn.getAttribute('data-sub'), row = btn.closest('tr'), input = row.querySelector('.input-cantidad'); let cantidad = parseInt(input.value) || 0; agregarAlCarrito(ean, desc, cantidad, fam, sub); input.value = 0; } });
document.getElementById('enviarPedidoBtn').addEventListener('click', () => {
    if (listaSurtido.length === 0) return showToast("La cesta está vacía", "error");
    let idPedido = 'PD-' + Math.floor(Math.random() * 10000), totalPzas = listaSurtido.reduce((s, i) => s + i.cantidad, 0), etaMinutes = 5 + (totalPzas * 2), etaTime = new Date(new Date().getTime() + etaMinutes * 60000);
    pedidosPendientes.push({ id: idPedido, fecha: new Date(), eta: etaTime, items: [...listaSurtido], estado: 'pendiente' });
    listaSurtido = []; actualizarPanelCarrito(); document.getElementById('surtidoContenido').classList.remove('visible'); document.getElementById('iconToggleSurtido').classList.remove('rotate-180');
    actualizarBandejaPedidosBodega(); if (familiaActiva && subfamiliaActiva) mostrarProveedores(familiaActiva, subfamiliaActiva);
    showToast(`Pedido ${idPedido} enviado a bodega. ETA: ${etaMinutes} mins.`, "success");
});

const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') { document.documentElement.classList.remove('dark'); document.getElementById('themeText').innerText = "Modo Oscuro"; }
cargarConfiguracion();