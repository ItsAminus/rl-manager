export function runMigration(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS careers (
      id TEXT PRIMARY KEY,
      managerName TEXT NOT NULL,
      teamId TEXT,
      region TEXT,
      difficulty TEXT,
      currentDate TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      gamertag TEXT NOT NULL,
      realName TEXT,
      nationality TEXT,
      region TEXT,
      age INTEGER,
      teamId TEXT,
      preferredTendency TEXT,
      overall INTEGER,
      potential INTEGER,
      form INTEGER,
      morale INTEGER,
      fatigue INTEGER,
      consistency INTEGER,
      chemistry INTEGER,
      reputation INTEGER,
      careerEarnings INTEGER,
      marketValue INTEGER,
      scoutKnowledge TEXT
    );

    CREATE TABLE IF NOT EXISTS player_attributes (
      playerId TEXT PRIMARY KEY,
      mechanical INTEGER,
      aerial INTEGER,
      groundControl INTEGER,
      shooting INTEGER,
      shotPower INTEGER,
      shotAccuracy INTEGER,
      passing INTEGER,
      defense INTEGER,
      goalkeeping INTEGER,
      positioning INTEGER,
      rotations INTEGER,
      boostManagement INTEGER,
      speed INTEGER,
      recovery INTEGER,
      fiftyFifty INTEGER,
      demolitions INTEGER,
      gameSense INTEGER,
      consistency INTEGER,
      clutch INTEGER,
      FOREIGN KEY(playerId) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS player_traits (
      playerId TEXT PRIMARY KEY,
      aggression INTEGER,
      riskTolerance INTEGER,
      teamOrientation INTEGER,
      adaptability INTEGER,
      pressureResistance INTEGER,
      developmentRate INTEGER,
      professionalism INTEGER,
      confidence INTEGER,
      tiltTendency INTEGER,
      FOREIGN KEY(playerId) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS player_stats (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL,
      seasonId TEXT NOT NULL,
      competitionId TEXT,
      games INTEGER DEFAULT 0,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      shots INTEGER DEFAULT 0,
      demos INTEGER DEFAULT 0,
      mvps INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      FOREIGN KEY(playerId) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS club_designs (
      careerId TEXT PRIMARY KEY,teamId TEXT NOT NULL,data TEXT NOT NULL,originalName TEXT,originalShortName TEXT
    );
    CREATE TABLE IF NOT EXISTS squad_car_presets (
      careerId TEXT NOT NULL,playerId TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(careerId,playerId)
    );
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      shortName TEXT,
      region TEXT,
      reputation INTEGER,
      budget INTEGER,
      cashBalance INTEGER,
      coachRating INTEGER,
      facilityLevel INTEGER,
      fanbase INTEGER,
      sponsorIncome INTEGER,
      teamChemistry INTEGER,
      teamForm INTEGER
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL,
      teamId TEXT NOT NULL,
      salary INTEGER,
      duration INTEGER,
      startDate TEXT,
      endDate TEXT,
      signingBonus INTEGER,
      buyout INTEGER,
      isActive INTEGER DEFAULT 1,
      FOREIGN KEY(playerId) REFERENCES players(id),
      FOREIGN KEY(teamId) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      region TEXT,
      type TEXT,
      format TEXT,
      prizePool INTEGER,
      seasonId TEXT,
      status TEXT,
      config TEXT
    );

    CREATE TABLE IF NOT EXISTS competition_entries (
      competitionId TEXT,
      teamId TEXT,
      groupName TEXT,
      seed INTEGER,
      PRIMARY KEY (competitionId, teamId),
      FOREIGN KEY(competitionId) REFERENCES competitions(id),
      FOREIGN KEY(teamId) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS fixtures (
      id TEXT PRIMARY KEY,
      competitionId TEXT NOT NULL,
      round INTEGER,
      homeTeamId TEXT NOT NULL,
      awayTeamId TEXT NOT NULL,
      scheduledDate TEXT,
      status TEXT,
      seriesFormat TEXT,
      homeScore INTEGER DEFAULT 0,
      awayScore INTEGER DEFAULT 0,
      FOREIGN KEY(competitionId) REFERENCES competitions(id),
      FOREIGN KEY(homeTeamId) REFERENCES teams(id),
      FOREIGN KEY(awayTeamId) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id TEXT PRIMARY KEY,
      fixtureId TEXT NOT NULL,
      gameNumber INTEGER,
      blueTeamId TEXT,
      orangeTeamId TEXT,
      blueScore INTEGER DEFAULT 0,
      orangeScore INTEGER DEFAULT 0,
      wasPlayed INTEGER DEFAULT 0,
      playedByHuman INTEGER DEFAULT 0,
      FOREIGN KEY(fixtureId) REFERENCES fixtures(id)
    );

    CREATE TABLE IF NOT EXISTS game_player_stats (
      id TEXT PRIMARY KEY,
      gameResultId TEXT NOT NULL,
      playerId TEXT NOT NULL,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      shots INTEGER DEFAULT 0,
      demos INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      FOREIGN KEY(gameResultId) REFERENCES game_results(id),
      FOREIGN KEY(playerId) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      careerId TEXT NOT NULL,
      date TEXT,
      type TEXT,
      title TEXT,
      description TEXT,
      relatedId TEXT,
      isRead INTEGER DEFAULT 0,
      FOREIGN KEY(careerId) REFERENCES careers(id)
    );

    CREATE TABLE IF NOT EXISTS inbox_items (
      id TEXT PRIMARY KEY,
      careerId TEXT NOT NULL,
      date TEXT,
      type TEXT,
      title TEXT,
      body TEXT,
      isRead INTEGER DEFAULT 0,
      actions TEXT,
      FOREIGN KEY(careerId) REFERENCES careers(id)
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL,
      fromTeamId TEXT,
      toTeamId TEXT,
      fee INTEGER,
      date TEXT,
      type TEXT,
      FOREIGN KEY(playerId) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS transfer_listings (
      careerId TEXT, playerId TEXT, askingPrice INTEGER, listedDate TEXT,
      lastApproachDate TEXT, PRIMARY KEY(careerId, playerId)
    );
    CREATE TABLE IF NOT EXISTS outgoing_offers (
      id TEXT PRIMARY KEY, careerId TEXT, playerId TEXT, sellerId TEXT, buyerId TEXT,
      fee INTEGER, ceiling INTEGER, salary INTEGER, bonus INTEGER, duration INTEGER,
      status TEXT, createdDate TEXT, expiresDate TEXT, responseDate TEXT,
      rounds INTEGER DEFAULT 0, reason TEXT
    );

    CREATE TABLE IF NOT EXISTS training_plans (
      id TEXT PRIMARY KEY,
      teamId TEXT NOT NULL,
      week INTEGER,
      category TEXT,
      intensity TEXT,
      FOREIGN KEY(teamId) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      careerId TEXT NOT NULL,
      number INTEGER,
      startDate TEXT,
      endDate TEXT,
      isActive INTEGER DEFAULT 1,
      FOREIGN KEY(careerId) REFERENCES careers(id)
    );

    CREATE TABLE IF NOT EXISTS career_competitions (
      competitionId TEXT PRIMARY KEY, careerId TEXT NOT NULL, stage TEXT,
      cycle INTEGER, startDate TEXT, sources TEXT
    );
    CREATE TABLE IF NOT EXISTS generated_entities (id TEXT PRIMARY KEY, kind TEXT, region TEXT);
    CREATE TABLE IF NOT EXISTS team_roster_sources (teamId TEXT PRIMARY KEY, status TEXT, verifiedAt TEXT, source TEXT, note TEXT, starterIds TEXT);
    CREATE TABLE IF NOT EXISTS player_affiliations (playerId TEXT PRIMARY KEY, status TEXT, verifiedAt TEXT, source TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS player_rating_sources (
      playerId TEXT PRIMARY KEY, version TEXT, baseline INTEGER, potential INTEGER,
      attributes TEXT, confidence TEXT, method TEXT, sources TEXT, reviewedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS competition_byes (competitionId TEXT, round INTEGER, teamId TEXT, PRIMARY KEY(competitionId, round, teamId));
    CREATE TABLE IF NOT EXISTS qualification_results (competitionId TEXT PRIMARY KEY, teams TEXT);
    CREATE TABLE IF NOT EXISTS career_training (careerId TEXT PRIMARY KEY, schedule TEXT);
    CREATE TABLE IF NOT EXISTS career_lineup (careerId TEXT PRIMARY KEY, players TEXT);
    CREATE TABLE IF NOT EXISTS career_tactics (careerId TEXT PRIMARY KEY, plan TEXT);
    CREATE TABLE IF NOT EXISTS manager_relationships (
      careerId TEXT, playerId TEXT, trust INTEGER DEFAULT 50, transferRequested INTEGER DEFAULT 0,
      lastChatDate TEXT, PRIMARY KEY (careerId, playerId)
    );
    CREATE TABLE IF NOT EXISTS player_conversations (
      id TEXT PRIMARY KEY, careerId TEXT, playerId TEXT, date TEXT, topic TEXT, status TEXT,
      transcript TEXT, context TEXT, resolvedDate TEXT
    );
    CREATE TABLE IF NOT EXISTS player_promises (
      id TEXT PRIMARY KEY, careerId TEXT, playerId TEXT, conversationId TEXT, kind TEXT,
      date TEXT, dueDate TEXT, status TEXT, context TEXT
    );
    CREATE TABLE IF NOT EXISTS interaction_series (
      careerId TEXT, fixtureId TEXT, date TEXT, starters TEXT, PRIMARY KEY (careerId, fixtureId)
    );
    CREATE TABLE IF NOT EXISTS series_selections (careerId TEXT, fixtureId TEXT, players TEXT, PRIMARY KEY (careerId, fixtureId));
    CREATE TABLE IF NOT EXISTS series_squads (careerId TEXT, fixtureId TEXT, players TEXT, PRIMARY KEY (careerId, fixtureId));
    CREATE TABLE IF NOT EXISTS team_talks (
      careerId TEXT, fixtureId TEXT, phase TEXT, date TEXT, tone TEXT, body TEXT, reactions TEXT,
      PRIMARY KEY (careerId, fixtureId, phase)
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_career ON player_conversations(careerId, playerId, date);
    CREATE TABLE IF NOT EXISTS player_development (
      careerId TEXT, playerId TEXT, progress REAL DEFAULT 0, PRIMARY KEY (careerId, playerId)
    );
    CREATE TABLE IF NOT EXISTS development_logs (
      id TEXT PRIMARY KEY, careerId TEXT, playerId TEXT, date TEXT, body TEXT
    );
    CREATE TABLE IF NOT EXISTS scout_assignments (
      id TEXT PRIMARY KEY, careerId TEXT, playerId TEXT, startedDate TEXT,
      dueDate TEXT, depth INTEGER, status TEXT
    );
    CREATE TABLE IF NOT EXISTS career_shortlist (
      careerId TEXT, playerId TEXT, PRIMARY KEY (careerId, playerId)
    );
    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY, careerId TEXT, playerId TEXT, fixtureId TEXT, date TEXT,
      author TEXT, body TEXT, sentiment TEXT, moraleChange INTEGER, confidenceChange INTEGER, responded INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_players_team ON players(teamId);
    CREATE INDEX IF NOT EXISTS idx_fixtures_competition ON fixtures(competitionId, round, status);
    CREATE INDEX IF NOT EXISTS idx_fixtures_date ON fixtures(scheduledDate, status);
    CREATE INDEX IF NOT EXISTS idx_career_competitions ON career_competitions(careerId, stage, cycle);
    CREATE INDEX IF NOT EXISTS idx_game_results_fixture ON game_results(fixtureId, gameNumber);
    CREATE INDEX IF NOT EXISTS idx_scout_assignments ON scout_assignments(careerId, playerId, status);
    CREATE INDEX IF NOT EXISTS idx_social_career ON social_posts(careerId, fixtureId);
    CREATE TABLE IF NOT EXISTS chirp_accounts (
      careerId TEXT, id TEXT, displayName TEXT, handle TEXT, kind TEXT, bio TEXT,
      region TEXT, playerId TEXT, teamId TEXT, verified INTEGER DEFAULT 0,
      followers INTEGER DEFAULT 0, color TEXT, PRIMARY KEY (careerId, id)
    );
    CREATE TABLE IF NOT EXISTS chirp_posts (
      id TEXT PRIMARY KEY, careerId TEXT, accountId TEXT, date TEXT, position INTEGER,
      body TEXT, topic TEXT, parentId TEXT, fixtureId TEXT, legacyPostId TEXT,
      sourceKey TEXT, baseLikes INTEGER DEFAULT 0, baseReposts INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0, UNIQUE (careerId, sourceKey)
    );
    CREATE TABLE IF NOT EXISTS chirp_reactions (
      careerId TEXT, postId TEXT, accountId TEXT, type TEXT, date TEXT,
      PRIMARY KEY (careerId, postId, accountId, type)
    );
    CREATE TABLE IF NOT EXISTS chirp_follows (careerId TEXT, accountId TEXT, PRIMARY KEY (careerId, accountId));
    CREATE TABLE IF NOT EXISTS chirp_bookmarks (careerId TEXT, postId TEXT, PRIMARY KEY (careerId, postId));
    CREATE TABLE IF NOT EXISTS chirp_notifications (
      id TEXT PRIMARY KEY, careerId TEXT, accountId TEXT, postId TEXT, type TEXT,
      body TEXT, date TEXT, isRead INTEGER DEFAULT 0, UNIQUE (careerId, postId, accountId, type)
    );
    CREATE TABLE IF NOT EXISTS chirp_days (careerId TEXT, date TEXT, PRIMARY KEY (careerId, date));
    CREATE TABLE IF NOT EXISTS chirp_text_jobs (
      postId TEXT PRIMARY KEY, careerId TEXT, context TEXT, state TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0, error TEXT, generatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS chirp_post_meta (
      postId TEXT PRIMARY KEY, careerId TEXT, quoteId TEXT, replyToId TEXT,
      tone TEXT, priority INTEGER DEFAULT 0, media TEXT
    );
    CREATE TABLE IF NOT EXISTS chirp_publications (
      postId TEXT PRIMARY KEY, careerId TEXT, published INTEGER DEFAULT 0,
      publishedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chirp_publications ON chirp_publications(careerId,published,postId);
    CREATE TABLE IF NOT EXISTS chirp_publication_order (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, postId TEXT UNIQUE, careerId TEXT
    );
    -- Preserve comments already shown by older versions. New AI drafts have
    -- their own unpublished record and are never exposed before completion.
    INSERT OR IGNORE INTO chirp_publications(postId,careerId,published)
      SELECT id,careerId,1 FROM chirp_posts;
    INSERT OR IGNORE INTO chirp_publication_order(postId,careerId)
      SELECT p.id,p.careerId FROM chirp_posts p JOIN chirp_publications publication ON publication.postId=p.id
      WHERE publication.published=1 ORDER BY COALESCE(publication.publishedAt,p.date),p.position;
    UPDATE chirp_text_jobs SET state='frozen'
      WHERE state='pending' AND postId IN(SELECT postId FROM chirp_publications WHERE published=1);
    UPDATE chirp_posts SET parentId=(SELECT replyToId FROM chirp_post_meta WHERE postId=chirp_posts.id)
      WHERE id IN(SELECT m.postId FROM chirp_post_meta m JOIN chirp_posts p ON p.id=m.postId
        WHERE m.replyToId IS NOT NULL AND m.replyToId<>m.postId AND m.replyToId IS NOT p.parentId);
    CREATE INDEX IF NOT EXISTS idx_chirp_meta_target ON chirp_post_meta(careerId,replyToId);
    CREATE INDEX IF NOT EXISTS idx_chirp_meta_career ON chirp_post_meta(careerId,postId);
    CREATE TABLE IF NOT EXISTS chirp_world_state (
      careerId TEXT PRIMARY KEY, batch INTEGER DEFAULT 0, refreshedAt REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS chirp_rivalries (
      careerId TEXT, teamA TEXT, teamB TEXT, intensity INTEGER DEFAULT 1,
      lastDate TEXT, PRIMARY KEY(careerId,teamA,teamB)
    );
    CREATE TABLE IF NOT EXISTS player_unrest (
      careerId TEXT, playerId TEXT, lowMoodSince TEXT, exhaustedSince TEXT,
      requestedDate TEXT, reason TEXT, requestStatus TEXT, listedByRequest INTEGER DEFAULT 0,
      PRIMARY KEY(careerId,playerId)
    );
    CREATE TABLE IF NOT EXISTS tournament_state (
      competitionId TEXT PRIMARY KEY, phase TEXT, drawDate TEXT, startDate TEXT,
      drawnAt TEXT, championId TEXT, config TEXT
    );
    CREATE TABLE IF NOT EXISTS tournament_groups (
      competitionId TEXT, teamId TEXT, groupName TEXT, seed INTEGER,
      PRIMARY KEY(competitionId,teamId)
    );
    CREATE TABLE IF NOT EXISTS tournament_stage_teams (
      competitionId TEXT, stage TEXT, teamId TEXT, groupName TEXT, seed INTEGER,
      PRIMARY KEY(competitionId,stage,teamId)
    );
    CREATE TABLE IF NOT EXISTS competition_rosters (
      competitionId TEXT, careerId TEXT, teamId TEXT, playerId TEXT,
      starter INTEGER, registeredAt TEXT, PRIMARY KEY(competitionId,teamId,playerId)
    );
    CREATE TABLE IF NOT EXISTS career_player_awards (
      careerId TEXT,competitionId TEXT,playerId TEXT,teamId TEXT,title TEXT,
      earnedDate TEXT,year INTEGER,source TEXT,
      PRIMARY KEY(careerId,competitionId,playerId)
    );
    CREATE TABLE IF NOT EXISTS tournament_nodes (
      id TEXT PRIMARY KEY, competitionId TEXT, lane TEXT, round INTEGER, label TEXT,
      homeSource TEXT, awaySource TEXT, homeTeamId TEXT, awayTeamId TEXT, fixtureId TEXT
    );
    CREATE TABLE IF NOT EXISTS fixture_stages (
      fixtureId TEXT PRIMARY KEY, competitionId TEXT, stage TEXT, groupName TEXT, nodeId TEXT
    );
    CREATE TABLE IF NOT EXISTS market_stories (
      id TEXT PRIMARY KEY, careerId TEXT, playerId TEXT, fromTeamId TEXT, toTeamId TEXT,
      date TEXT, resolveDate TEXT, status TEXT, fee INTEGER, salary INTEGER, reason TEXT
    );
    CREATE TABLE IF NOT EXISTS earned_development (
      careerId TEXT,playerId TEXT,cycleStart TEXT,trainingCredit REAL DEFAULT 0,
      trainingDays INTEGER DEFAULT 0,lastTrainingDate TEXT,lastGainDate TEXT,
      PRIMARY KEY(careerId,playerId)
    );
    CREATE TABLE IF NOT EXISTS player_skill_development (
      careerId TEXT,playerId TEXT,baseOverall INTEGER NOT NULL,baseSkills TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,earnedPoints INTEGER NOT NULL DEFAULT 0,spentPoints INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(careerId,playerId)
    );
    CREATE TABLE IF NOT EXISTS career_modes(careerId TEXT PRIMARY KEY,mode TEXT NOT NULL DEFAULT 'Manager Career');
    CREATE TABLE IF NOT EXISTS path_setups(careerId TEXT PRIMARY KEY,rank TEXT NOT NULL,generated INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS path_form_rewards(careerId TEXT,rewardKey TEXT,playerId TEXT,fixtureId TEXT,claimedAt TEXT,PRIMARY KEY(careerId,rewardKey));
    CREATE TABLE IF NOT EXISTS series_timeouts(careerId TEXT,fixtureId TEXT,afterGame INTEGER,tone TEXT,orders TEXT,PRIMARY KEY(careerId,fixtureId,afterGame));
    CREATE TABLE IF NOT EXISTS series_timeout_clocks(careerId TEXT,fixtureId TEXT,side TEXT,afterGame INTEGER,startedAt REAL,endsAt REAL,orders TEXT,PRIMARY KEY(careerId,fixtureId,side));
    CREATE TABLE IF NOT EXISTS path_campaigns(careerId TEXT PRIMARY KEY,roster TEXT NOT NULL,unlockedCutoff INTEGER DEFAULT 0,streak INTEGER DEFAULT 0,bestStreak INTEGER DEFAULT 0,games INTEGER DEFAULT 0,wins INTEGER DEFAULT 0,completedAt TEXT,tutorialStep INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS path_player_xp(careerId TEXT,playerId TEXT,xp INTEGER DEFAULT 0,totalXp INTEGER DEFAULT 0,PRIMARY KEY(careerId,playerId));
    CREATE TABLE IF NOT EXISTS path_rewards(gameResultId TEXT PRIMARY KEY,careerId TEXT,xp INTEGER,streak INTEGER,multiplier REAL);
    CREATE TABLE IF NOT EXISTS path_series(fixtureId TEXT PRIMARY KEY,careerId TEXT,trialCutoff INTEGER,processed INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS path_rivals(careerId TEXT,chapter INTEGER,teamId TEXT,wins INTEGER DEFAULT 0,losses INTEGER DEFAULT 0,PRIMARY KEY(careerId,chapter));
    CREATE TABLE IF NOT EXISTS path_achievements(careerId TEXT,key TEXT,title TEXT,date TEXT,xp INTEGER,PRIMARY KEY(careerId,key));
    CREATE TABLE IF NOT EXISTS path_memories(id TEXT PRIMARY KEY,careerId TEXT,date TEXT,kind TEXT,title TEXT,body TEXT,fixtureId TEXT);
    CREATE TABLE IF NOT EXISTS development_evidence (
      careerId TEXT,playerId TEXT,fixtureId TEXT,date TEXT,opponentRating REAL,
      performance REAL,weight REAL,role TEXT,PRIMARY KEY(careerId,playerId,fixtureId)
    );
    CREATE TABLE IF NOT EXISTS game_development (
      gameResultId TEXT,playerId TEXT,performance REAL,role TEXT,
      PRIMARY KEY(gameResultId,playerId)
    );
    CREATE INDEX IF NOT EXISTS idx_development_evidence ON development_evidence(careerId,playerId,date);
    CREATE INDEX IF NOT EXISTS idx_market_stories_career ON market_stories(careerId,status,date);
    CREATE INDEX IF NOT EXISTS idx_chirp_text_jobs ON chirp_text_jobs(careerId,state);
    CREATE TABLE IF NOT EXISTS game_incidents (
      gameResultId TEXT, sequence INTEGER, playerId TEXT, teamId TEXT, type TEXT,
      remaining REAL, overtime INTEGER, critical INTEGER, evidence TEXT,
      PRIMARY KEY(gameResultId,sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_game_incident_player ON game_incidents(gameResultId,playerId,type);
    CREATE INDEX IF NOT EXISTS idx_chirp_feed ON chirp_posts(careerId, parentId, date DESC, position DESC);
    CREATE INDEX IF NOT EXISTS idx_chirp_author ON chirp_posts(careerId, accountId, date DESC);
    CREATE INDEX IF NOT EXISTS idx_chirp_replies ON chirp_posts(careerId, parentId);
    CREATE INDEX IF NOT EXISTS idx_chirp_reactions ON chirp_reactions(careerId, postId);
    CREATE INDEX IF NOT EXISTS idx_chirp_people ON chirp_accounts(careerId, kind, region);
    CREATE INDEX IF NOT EXISTS idx_chirp_date_position ON chirp_posts(careerId, date, position);
    CREATE INDEX IF NOT EXISTS idx_chirp_legacy ON chirp_posts(careerId, legacyPostId);
    CREATE INDEX IF NOT EXISTS idx_chirp_actor_reactions ON chirp_reactions(careerId, accountId, type, postId);
    CREATE INDEX IF NOT EXISTS idx_chirp_fan_accounts ON chirp_accounts(careerId, kind, id);
    CREATE INDEX IF NOT EXISTS idx_chirp_notifications ON chirp_notifications(careerId, isRead, date);
    CREATE INDEX IF NOT EXISTS idx_stats_game_player ON game_player_stats(gameResultId, playerId);
    CREATE INDEX IF NOT EXISTS idx_games_fixture_number ON game_results(fixtureId,gameNumber);
    CREATE INDEX IF NOT EXISTS idx_fixtures_status_date ON fixtures(competitionId, status, scheduledDate);
  `);
  if(!db.prepare('PRAGMA table_info(transfers)').all().some((c:any)=>c.name==='careerId'))db.exec('ALTER TABLE transfers ADD COLUMN careerId TEXT');
}
