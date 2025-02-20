// Global caches for hero and match data
let heroesCache = null;
let matchesCache = [];
let lastMMRFilter = ""; // To track if the MMR filter changed

// Function to fetch and cache hero data
async function fetchHeroData() {
  if (heroesCache) {
    return heroesCache;
  }
  
  try {
    const response = await fetch('https://api.opendota.com/api/heroes');
    const heroes = await response.json();
    // Create a Map of hero ID to hero name
    heroesCache = new Map(heroes.map(hero => [hero.id, hero.localized_name]));
    console.log('Heroes loaded:', heroesCache.size);
    return heroesCache;
  } catch (error) {
    console.error('Error fetching hero data:', error);
    return new Map();
  }
}

// Function to populate the hero selection dropdown
async function populateHeroSelect() {
  const heroSelect = document.getElementById('heroSelect');
  const heroes = await fetchHeroData();
  // Clear any existing options, add default "All Heroes"
  heroSelect.innerHTML = '<option value="">All Heroes</option>';
  
  // Convert heroes map to an array, sort alphabetically, and add options
  const heroArray = Array.from(heroes.entries());
  heroArray.sort((a, b) => a[1].localeCompare(b[1]));
  heroArray.forEach(([id, name]) => {
    const option = document.createElement('option');
    option.value = id;
    option.text = name;
    heroSelect.appendChild(option);
  });
}

// Helper function to get hero name from ID
async function getHeroName(heroId) {
  const heroes = await fetchHeroData();
  return heroes.get(Number(heroId)) || `Unknown Hero (${heroId})`;
}

// Update the getTeamHeroes function to handle the correct API response format
function getTeamHeroes(match) {
  const radiantHeroes = [];
  const direHeroes = [];

  // The API returns an array of player data in the 'players' property
  if (match.players) {
    match.players.forEach((player, index) => {
      if (player.hero_id) {
        // Assuming the first five players are Radiant and the rest Dire
        if (index < 5) {
          radiantHeroes.push(player.hero_id);
        } else {
          direHeroes.push(player.hero_id);
        }
      }
    });
  }

  return { radiantHeroes, direHeroes };
}

// Function to fetch matches based on user-selected filters
async function fetchMatches() {
  const mmrBracket = document.getElementById('mmrSelect').value;
  const selectedHeroId = document.getElementById('heroSelect').value;
  const matchesList = document.getElementById('matchesList');

  // Show a loading state
  matchesList.innerHTML = '<li class="loading">Loading matches...</li>';

  try {
    // Ensure hero data is loaded first
    await fetchHeroData();

    // If the MMR filter has changed, clear the match cache.
    if (mmrBracket !== lastMMRFilter) {
      matchesCache = [];
      lastMMRFilter = mmrBracket;
    }

    // Construct the base URL
    let baseUrl = 'https://api.opendota.com/api/publicMatches';
    if (mmrBracket) {
      baseUrl += `?mmr_ascending=${mmrBracket}`;
    }

    // If cache is empty, fetch new matches
    if (!matchesCache.length) {
      let pagesToFetch = 5; // Change this number to get more matches
      let fetchedMatches = [];
      let lastMatchId = null;

      for (let i = 0; i < pagesToFetch; i++) {
        let url = baseUrl;
        if (lastMatchId) {
          // Check if the baseUrl already contains a query parameter
          if (baseUrl.includes('?')) {
            url += `&less_than_match_id=${lastMatchId}`;
          } else {
            url += `?less_than_match_id=${lastMatchId}`;
          }
        }

        const response = await fetch(url);
        if (!response.ok) break;

        let pageMatches = await response.json();
        if (!pageMatches.length) break; // Stop fetching if no more matches exist

        fetchedMatches = fetchedMatches.concat(pageMatches);
        lastMatchId = pageMatches[pageMatches.length - 1].match_id; // Get the last match ID for pagination

        // Small delay to avoid hitting API rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      matchesCache = fetchedMatches;
    }

    console.log('Total matches in cache:', matchesCache.length);
    matchesList.innerHTML = ''; // Clear loading message

    if (!matchesCache.length) {
      matchesList.innerHTML = '<li class="no-matches">No matches found</li>';
      return;
    }

    let matchesDisplayed = 0;
    for (const match of matchesCache) {
      const { radiantHeroes, direHeroes } = getTeamHeroes(match);
		const shouldDisplay = !selectedHeroId ||
			radiantHeroes.includes(Number(selectedHeroId)) ||
			direHeroes.includes(Number(selectedHeroId));

      if (shouldDisplay) {
        const listItem = document.createElement('li');
        listItem.className = 'match-item';

        const timeAgo = new Date(match.start_time * 1000).toLocaleString();

        // Retrieve hero names for each team
        const radiantHeroNames = await Promise.all(radiantHeroes.map(getHeroName));
        const direHeroNames = await Promise.all(direHeroes.map(getHeroName));

        // Build match display with additional details
        listItem.innerHTML = `
          <div class="match-header">
            <span class="match-id">Match ID: ${match.match_id}</span>
            <span class="match-winner ${match.radiant_win ? 'radiant' : 'dire'}">
              Winner: ${match.radiant_win ? 'Radiant' : 'Dire'}
            </span>
            <span class="match-time">Played: ${timeAgo}</span>
            ${match.duration ? `<span class="match-duration">Duration: ${Math.floor(match.duration / 60)}:${(match.duration % 60).toString().padStart(2, '0')}</span>` : ''}
          </div>
          <div class="teams">
            <div class="radiant-team">
              <h4 class="team-header">Radiant Team</h4>
              ${radiantHeroNames.join(', ')}
              ${match.radiant_score ? `<div class="team-score">Score: ${match.radiant_score}</div>` : ''}
            </div>
            <div class="dire-team">
              <h4 class="team-header">Dire Team</h4>
              ${direHeroNames.join(', ')}
              ${match.dire_score ? `<div class="team-score">Score: ${match.dire_score}</div>` : ''}
            </div>
          </div>
        `;
        matchesList.appendChild(listItem);
        matchesDisplayed++;
      }
    }

    if (matchesDisplayed === 0) {
      matchesList.innerHTML = '<li class="no-matches">No matches found with the selected hero</li>';
    }

  } catch (error) {
    console.error('Error:', error);
    matchesList.innerHTML = `<li class="error">Error fetching matches: ${error.message}</li>`;
  }
}

// Attach event listener to the Filter Matches button
document.getElementById('filterButton').addEventListener('click', fetchMatches);

// On page load, populate the hero selection dropdown
document.addEventListener('DOMContentLoaded', async () => {
  await populateHeroSelect();
});
