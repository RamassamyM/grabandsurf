// Landing page texts in French, English and Spanish, selected from the pitch deck.
// No em dash in displayed texts (team rule).
export const CONTENT = {
  fr: {
    nav: { concept: 'Le concept', passport: 'Passeport', riders: 'Ambassadeurs', pros: 'Pour qui', spots: 'Spots', cta: 'Trouver un spot' },
    hero: {
      kicker: 'Location de planches en liège, en libre-service',
      title: 'Ta planche en 2 gestes.',
      accent: 'Sans personne sur la plage.',
      text: "Scanne le QR du rack, prends ta planche, raccroche-la en sortant de l'eau. Le reste se fait tout seul.",
      find: 'Trouver un spot', demo: 'Essayer la démo',
    },
    problem: {
      title: '8 h. Les vagues sont parfaites.', accent: 'Et toi, pas de planche.',
      items: [
        ['clock', 'Loueur fermé jusqu’à 10 h', 'La meilleure marée passe pendant que le rideau est baissé.'],
        ['file', 'File d’attente et papiers', 'Pièce d’identité, formulaire, carte : vingt minutes avant de toucher l’eau.'],
        ['wallet', 'Caution à laisser sur place', 'Un chèque ou un passeport qui reste au comptoir pendant ta session.'],
      ],
    },
    gestures: {
      title: 'Louer, c’est', accent: '2 gestes.',
      steps: [
        ['qr', 'Scanne et prends', 'Le QR du rack t’indique ta planche. Elle se libère, tu files à l’eau.'],
        ['return', 'Raccroche', 'C’est fini. Le retour est détecté tout seul, tu reçois ton reçu par SMS.'],
      ],
      note: 'Personne sur place. Pas d’appli à installer.',
    },
    auto: {
      title: 'Et tout le reste', accent: 'se fait tout seul.',
      items: [
        ['signal', 'Retour automatique', 'La station entend la planche revenir. Rien à confirmer.'],
        ['card', 'Caution automatique', 'Une empreinte bancaire, jamais débitée si la planche revient.'],
        ['wrench', 'Réparation sans souci', 'Une photo au retour, l’atelier s’occupe du reste.'],
        ['swap', 'Revente ou échange', 'Tu adores ta planche ? Garde-la, ou échange-la.'],
      ],
    },
    passport: {
      title: 'Chaque planche', accent: 'a une mémoire.',
      text: 'Un jeton sur la blockchain Avalanche garde son histoire : sessions, retours, réparations. Historique certifié, aucun wallet pour le surfeur, aucune donnée personnelle.',
      timeline: [['spark', 'Mise en service'], ['waves', '342 sessions'], ['wrench', '2 réparations'], ['tag', 'Revendue, historique prouvé']],
      caption: 'À la revente : le carnet d’entretien de la planche.',
      example: 'Exemple illustratif',
      cta: 'Voir le passeport de korko-01',
    },
    riders: {
      title: 'Tu surfes la planche', accent: 'd’un champion.',
      text: 'Scanne ta planche : tu découvres qui l’a surfée avant toi. Et tu le partages.',
      surfed: 'a surfé', see: 'Voir la planche',
      fictional: 'Ambassadeurs de la démo : personnages fictifs, en attendant nos riders.',
    },
    worry: {
      title: 'Zéro souci.',
      items: [
        ['shield', 'Vol', 'L’alarme sonne à la station. Une planche pas rendue ? Elle est achetée.'],
        ['camera', 'Casse', 'La photo au retour tranche. L’IA propose, l’exploitant décide.'],
        ['offline', 'Réseau', 'La station continue seule, et rattrape ensuite.'],
      ],
    },
    pros: {
      title: 'Pour qui ?',
      items: [
        ['school', 'Écoles de surf', 'Les planches se louent seules.', 'Le prof reste dans l’eau, du lever au coucher du soleil. Zéro caisse, zéro litige.'],
        ['store', 'La marque', 'Notox vend plus, et voit tout.', 'Racks et planches vendus, un abonnement par station, le parc en temps réel. Réparer, revendre, pas jeter.'],
        ['ticket', 'Entreprises', 'Offre des vagues à tes équipes.', 'Un pack d’heures, un code par salarié, sur n’importe quelle station. Chaque heure utilisée est prouvée.'],
        ['palette', 'Sponsors et artistes', 'Une planche d’artiste. Un impact prouvé.', 'Le sponsor finance, l’artiste signe le design. Sessions et surfeurs tracés : un impact certifié, pas une bâche.'],
      ],
      partner: 'Devenir partenaire',
    },
    spots: {
      title: 'Trouve ta station',
      text: 'Nos racks ouverts à Biarritz et les prochaines ouvertures sur les côtes françaises et espagnoles.',
      search: 'Chercher un spot, une ville, une région',
      open: 'Ouvert', soon: 'Bientôt', all: 'Tous', france: 'France', spain: 'Espagne',
      boards: '{n} planche(s) dispo', offline: 'station hors ligne', rent: 'Louer ici', none: 'Aucun spot ne correspond.',
      count: '{open} ouverts, {soon} à venir',
    },
    final: {
      title: 'Scanne-moi.', text: 'Chaque planche a une histoire. Celle-ci te réserve une surprise.',
      cta: 'Ouvrir le passeport',
    },
    footer: { tagline: 'Hackathon SHAKA Festival, défi Green Wave.', demo: 'Espace démo', partner: 'Espace partenaire', operator: 'Exploitant' },
  },

  en: {
    nav: { concept: 'Concept', passport: 'Passport', riders: 'Riders', pros: 'For whom', spots: 'Spots', cta: 'Find a spot' },
    hero: {
      kicker: 'Self-service cork surfboard rental',
      title: 'Your board in 2 moves.',
      accent: 'Nobody needed on the beach.',
      text: 'Scan the rack QR code, grab your board, hang it back when you leave the water. Everything else happens on its own.',
      find: 'Find a spot', demo: 'Try the demo',
    },
    problem: {
      title: '8 am. The waves are perfect.', accent: 'And you have no board.',
      items: [
        ['clock', 'Rental shop closed until 10', 'The best tide goes by while the shutter is down.'],
        ['file', 'Queues and paperwork', 'ID, form, card: twenty minutes before you touch the water.'],
        ['wallet', 'A deposit left behind', 'A cheque or a passport waiting at the counter during your session.'],
      ],
    },
    gestures: {
      title: 'Renting takes', accent: '2 moves.',
      steps: [
        ['qr', 'Scan and grab', 'The rack QR code shows you your board. It unlocks, off you go.'],
        ['return', 'Hang it back', 'Done. The return is detected on its own, your receipt comes by text.'],
      ],
      note: 'Nobody on site. No app to install.',
    },
    auto: {
      title: 'And everything else', accent: 'happens on its own.',
      items: [
        ['signal', 'Automatic return', 'The station hears the board come back. Nothing to confirm.'],
        ['card', 'Automatic deposit', 'A card hold, never charged if the board comes back.'],
        ['wrench', 'Worry-free repairs', 'A photo at return, the workshop takes care of the rest.'],
        ['swap', 'Buy or swap', 'Love your board? Keep it, or swap it.'],
      ],
    },
    passport: {
      title: 'Every board', accent: 'has a memory.',
      text: 'A token on the Avalanche blockchain keeps its story: sessions, returns, repairs. Certified history, no wallet for the surfer, no personal data.',
      timeline: [['spark', 'Put into service'], ['waves', '342 sessions'], ['wrench', '2 repairs'], ['tag', 'Resold, proven history']],
      caption: 'When resold: the service record of the board.',
      example: 'Illustrative example',
      cta: 'See the passport of korko-01',
    },
    riders: {
      title: 'You ride the board', accent: 'of a champion.',
      text: 'Scan your board: find out who rode it before you. And share it.',
      surfed: 'rode', see: 'See the board',
      fictional: 'Demo riders: fictional characters, until our real riders join.',
    },
    worry: {
      title: 'Zero worries.',
      items: [
        ['shield', 'Theft', 'The alarm rings at the station. A board not returned? It is bought.'],
        ['camera', 'Damage', 'The return photo settles it. The AI suggests, the operator decides.'],
        ['offline', 'Network', 'The station keeps going on its own, and catches up later.'],
      ],
    },
    pros: {
      title: 'For whom?',
      items: [
        ['school', 'Surf schools', 'Boards rent themselves.', 'The teacher stays in the water, from sunrise to sunset. No till, no disputes.'],
        ['store', 'The brand', 'Notox sells more, and sees everything.', 'Racks and boards sold, a subscription per station, the fleet in real time. Repair, resell, never throw away.'],
        ['ticket', 'Companies', 'Give your teams some waves.', 'A pack of hours, one code per employee, on any station. Every hour used is proven.'],
        ['palette', 'Sponsors and artists', 'An artist board. A proven impact.', 'The sponsor funds, the artist signs the design. Sessions and surfers tracked: certified impact, not a banner.'],
      ],
      partner: 'Become a partner',
    },
    spots: {
      title: 'Find your station',
      text: 'Our open racks in Biarritz and the next openings on the French and Spanish coasts.',
      search: 'Search a spot, a town, a region',
      open: 'Open', soon: 'Soon', all: 'All', france: 'France', spain: 'Spain',
      boards: '{n} board(s) available', offline: 'station offline', rent: 'Rent here', none: 'No spot matches.',
      count: '{open} open, {soon} coming soon',
    },
    final: {
      title: 'Scan me.', text: 'Every board has a story. This one has a surprise for you.',
      cta: 'Open the passport',
    },
    footer: { tagline: 'SHAKA Festival hackathon, Green Wave challenge.', demo: 'Demo area', partner: 'Partner area', operator: 'Operator' },
  },

  es: {
    nav: { concept: 'El concepto', passport: 'Pasaporte', riders: 'Embajadores', pros: 'Para quién', spots: 'Spots', cta: 'Buscar un spot' },
    hero: {
      kicker: 'Alquiler de tablas de corcho en autoservicio',
      title: 'Tu tabla en 2 gestos.',
      accent: 'Sin nadie en la playa.',
      text: 'Escanea el QR del rack, coge tu tabla y cuélgala al salir del agua. Todo lo demás se hace solo.',
      find: 'Buscar un spot', demo: 'Probar la demo',
    },
    problem: {
      title: '8 h. Las olas son perfectas.', accent: 'Y tú, sin tabla.',
      items: [
        ['clock', 'Alquiler cerrado hasta las 10', 'La mejor marea pasa mientras la persiana sigue bajada.'],
        ['file', 'Colas y papeleo', 'DNI, formulario, tarjeta: veinte minutos antes de tocar el agua.'],
        ['wallet', 'Fianza en el mostrador', 'Un cheque o un pasaporte que se queda allí durante tu sesión.'],
      ],
    },
    gestures: {
      title: 'Alquilar son', accent: '2 gestos.',
      steps: [
        ['qr', 'Escanea y coge', 'El QR del rack te indica tu tabla. Se libera y te vas al agua.'],
        ['return', 'Cuélgala', 'Listo. La devolución se detecta sola y recibes el recibo por SMS.'],
      ],
      note: 'Nadie en el lugar. Ninguna app que instalar.',
    },
    auto: {
      title: 'Y todo lo demás', accent: 'se hace solo.',
      items: [
        ['signal', 'Devolución automática', 'La estación oye volver la tabla. Nada que confirmar.'],
        ['card', 'Fianza automática', 'Una preautorización bancaria, nunca cobrada si la tabla vuelve.'],
        ['wrench', 'Reparación sin líos', 'Una foto al devolverla, el taller se encarga del resto.'],
        ['swap', 'Compra o cambio', '¿Te encanta tu tabla? Quédatela o cámbiala.'],
      ],
    },
    passport: {
      title: 'Cada tabla', accent: 'tiene memoria.',
      text: 'Un token en la blockchain Avalanche guarda su historia: sesiones, devoluciones, reparaciones. Historial certificado, sin wallet para el surfista, sin datos personales.',
      timeline: [['spark', 'Puesta en servicio'], ['waves', '342 sesiones'], ['wrench', '2 reparaciones'], ['tag', 'Revendida, historial probado']],
      caption: 'Al revenderla: el libro de mantenimiento de la tabla.',
      example: 'Ejemplo ilustrativo',
      cta: 'Ver el pasaporte de korko-01',
    },
    riders: {
      title: 'Surfeas la tabla', accent: 'de un campeón.',
      text: 'Escanea tu tabla: descubre quién la surfeó antes que tú. Y compártelo.',
      surfed: 'surfeó', see: 'Ver la tabla',
      fictional: 'Embajadores de la demo: personajes ficticios, hasta que lleguen nuestros riders.',
    },
    worry: {
      title: 'Cero problemas.',
      items: [
        ['shield', 'Robo', 'La alarma suena en la estación. ¿Una tabla no devuelta? Queda comprada.'],
        ['camera', 'Rotura', 'La foto de devolución decide. La IA propone, el operador decide.'],
        ['offline', 'Red', 'La estación sigue sola y se pone al día después.'],
      ],
    },
    pros: {
      title: '¿Para quién?',
      items: [
        ['school', 'Escuelas de surf', 'Las tablas se alquilan solas.', 'El monitor se queda en el agua, del amanecer al atardecer. Sin caja, sin litigios.'],
        ['store', 'La marca', 'Notox vende más y lo ve todo.', 'Racks y tablas vendidos, una suscripción por estación, la flota en tiempo real. Reparar, revender, no tirar.'],
        ['ticket', 'Empresas', 'Regala olas a tus equipos.', 'Un pack de horas, un código por empleado, en cualquier estación. Cada hora usada queda probada.'],
        ['palette', 'Patrocinadores y artistas', 'Una tabla de artista. Un impacto probado.', 'El patrocinador financia, el artista firma el diseño. Sesiones y surfistas trazados: impacto certificado, no una lona.'],
      ],
      partner: 'Hacerse socio',
    },
    spots: {
      title: 'Encuentra tu estación',
      text: 'Nuestros racks abiertos en Biarritz y las próximas aperturas en las costas francesas y españolas.',
      search: 'Buscar un spot, una ciudad, una región',
      open: 'Abierto', soon: 'Pronto', all: 'Todos', france: 'Francia', spain: 'España',
      boards: '{n} tabla(s) disponible(s)', offline: 'estación sin conexión', rent: 'Alquilar aquí', none: 'Ningún spot coincide.',
      count: '{open} abiertos, {soon} próximamente',
    },
    final: {
      title: 'Escanéame.', text: 'Cada tabla tiene una historia. Esta te guarda una sorpresa.',
      cta: 'Abrir el pasaporte',
    },
    footer: { tagline: 'Hackathon SHAKA Festival, reto Green Wave.', demo: 'Zona demo', partner: 'Zona socios', operator: 'Operador' },
  },
}

// Demo ambassadors (fictional, same as backend/chain/ambassadors.json).
export const RIDERS = [
  { board: 'korko-01', name: 'Maïa', tagline: { fr: 'Surfeuse du matin, Grande Plage', en: 'Dawn surfer, Grande Plage', es: 'Surfista del amanecer, Grande Plage' },
    story: { fr: 'Je l’ai prise à l’aube, trois vagues avant le café. Le liège flotte comme un bouchon.', en: 'I took it at dawn, three waves before coffee. Cork floats like a bottle stopper.', es: 'La cogí al amanecer, tres olas antes del café. El corcho flota como un tapón.' } },
  { board: 'korko-02', name: 'Tom', tagline: { fr: 'Prof de surf à Anglet', en: 'Surf teacher in Anglet', es: 'Monitor de surf en Anglet' },
    story: { fr: 'Mes élèves apprennent dessus. Elle a déjà vu plus de débutants que moi.', en: 'My students learn on it. It has seen more beginners than I have.', es: 'Mis alumnos aprenden con ella. Ha visto más principiantes que yo.' } },
  { board: 'korko-03', name: 'Inès', tagline: { fr: 'Bodysurfeuse, Côte des Basques', en: 'Bodysurfer, Côte des Basques', es: 'Bodysurfista, Côte des Basques' },
    story: { fr: 'Une planche qui a une histoire, ça se respecte. Je la raccroche toujours bien.', en: 'A board with a story deserves respect. I always hang it back properly.', es: 'Una tabla con historia se respeta. Siempre la cuelgo bien.' } },
  { board: 'korko-05', name: 'Nora', tagline: { fr: 'Longboardeuse, Milady', en: 'Longboarder, Milady', es: 'Longboarder, Milady' },
    story: { fr: 'Elle vient des forêts des Landes et elle revient toujours à la plage.', en: 'It comes from the Landes forests and always comes back to the beach.', es: 'Viene de los bosques de las Landas y siempre vuelve a la playa.' } },
]
