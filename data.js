// Mock data: Project → Tenders (each with one SoR Template, no prices) → tenderers' SoR submissions (with prices).
// Replace DATA with an API call when the Document Library / SoR extraction is available.
const DATA = (() => {
  // [item name, unit, base rate]
  const LIB = {
    Wires: [
      ['Copper cable 2.5mm² PVC', 'm', 4.2], ['Copper cable 6mm² PVC', 'm', 7.8], ['Armoured cable 4C 16mm²', 'm', 28.5],
      ['Armoured cable 4C 35mm²', 'm', 52], ['Fibre optic cable 12-core', 'm', 6.4], ['Earthing conductor 70mm²', 'm', 18.9],
      ['Cable tray 300mm galvanised', 'm', 42], ['Cable ladder 600mm', 'm', 88], ['Conduit uPVC 25mm', 'm', 3.6], ['Cable termination kit', 'no.', 65],
    ],
    Manpower: [
      ['Project manager', 'day', 980], ['Site engineer', 'day', 520], ['Foreman', 'day', 340], ['Surveyor', 'day', 410],
      ['Safety officer', 'day', 360], ['Steel fixer', 'day', 210], ['Carpenter', 'day', 205], ['Welder', 'day', 245],
      ['Electrician', 'day', 260], ['Crane operator', 'day', 320], ['Rigger', 'day', 230], ['General labourer', 'day', 145],
    ],
    Equipment: [
      ['Crawler crane 100t', 'day', 4200], ['Mobile crane 50t', 'day', 2300], ['Excavator 20t', 'day', 1150], ['Concrete pump', 'day', 1550],
      ['Bored piling rig', 'day', 5400], ['Generator 250kVA', 'day', 390], ['Scaffolding system', 'm²/wk', 6.5], ['Aerial work platform', 'day', 310],
    ],
    Earthworks: [
      ['Site clearance', 'm²', 2.4], ['Excavation in soil', 'm³', 14], ['Excavation in rock', 'm³', 68], ['Disposal of spoil off-site', 'm³', 22],
      ['Imported fill compacted', 'm³', 31], ['Geotextile separator', 'm²', 3.9], ['Sheet piling (temporary)', 'm²', 120], ['Dewatering', 'day', 640],
    ],
    Pavement: [
      ['Sub-base course 200mm', 'm²', 18], ['Base course 150mm', 'm²', 21], ['Asphalt binder course 60mm', 'm²', 24], ['Asphalt wearing course 40mm', 'm²', 19],
      ['Concrete kerb', 'm', 36], ['Road marking thermoplastic', 'm', 4.1], ['Drainage channel U-type', 'm', 95], ['Manhole 1.2m dia', 'no.', 2800],
    ],
    Finishes: [
      ['Homogeneous floor tiles', 'm²', 58], ['Granite cladding', 'm²', 240], ['Suspended ceiling (aluminium)', 'm²', 96], ['Emulsion paint 2 coats', 'm²', 6.8],
      ['Glass balustrade', 'm', 620], ['Stainless steel handrail', 'm', 280], ['Fire-rated door', 'no.', 1850], ['Tactile ground indicator', 'm²', 145],
    ],
  };
  const TENDERERS = ['Alpha Construction', 'Bina Engineering', 'Citra Builders', 'Delta Civil', 'Everest Infra', 'Fortis Works', 'Granite Pacific'];
  const RENAMES = [' (equivalent)', ' – alt. spec', ' (rev.)'];

  function rng(a) { // mulberry32, seeded so the demo data is stable
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function tender(id, code, name, estimate, tabs, seed, nSubs) {
    const r = rng(seed);
    const template = {
      name: `${name} – SoR Template`,
      tabs: tabs.map(tab => ({ name: tab, items: LIB[tab].map(([n, unit, base]) => ({ name: n, unit, base: base * (0.9 + r() * 0.2) })) })),
    };
    const submissions = TENDERERS.slice(seed % 3, seed % 3 + nSubs).map((tenderer, i) => ({
      id: `${id}-S${i + 1}`,
      tenderer,
      tabs: template.tabs.map(tab => tab.items.map(it => {
        const x = r();
        let rate;
        if (x < 0.04) rate = 'NA';
        else if (x < 0.07) rate = '';
        else {
          let f = 1 + (r() - 0.5) * 0.24;
          if (r() < 0.12) f *= r() < 0.5 ? 1.45 : 0.65; // occasional outlier
          rate = Math.round(it.base * f * 100) / 100;
        }
        const name = r() < 0.04 ? it.name + RENAMES[Math.floor(r() * RENAMES.length)] : it.name;
        return { name, rate };
      })),
    }));
    return { id, code, name, estimate, template, submissions };
  }

  return {
    projects: [
      {
        id: 'P1', name: 'Contribution of MRT',
        tenders: [
          tender('P1T1', 'T1', 'Bridge Works', '$20M', ['Wires', 'Manpower', 'Equipment'], 11, 5),
          tender('P1T2', 'T2', 'Road Works', '$12M', ['Earthworks', 'Pavement', 'Manpower'], 23, 4),
          tender('P1T3', 'T3', 'Station Works', '$34M', ['Wires', 'Finishes', 'Manpower', 'Equipment'], 37, 6),
        ],
      },
      {
        id: 'P2', name: 'Eastern Line Extension',
        tenders: [
          tender('P2T1', 'T1', 'Viaduct Works', '$41M', ['Wires', 'Manpower', 'Equipment'], 52, 5),
          tender('P2T2', 'T2', 'Depot Works', '$18M', ['Earthworks', 'Finishes', 'Manpower'], 64, 4),
        ],
      },
    ],
  };
})();
