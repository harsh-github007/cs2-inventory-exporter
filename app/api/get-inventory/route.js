import { NextResponse } from 'next/server';

const STEAM_API_KEY = process.env.STEAM_API_KEY;

// Helper to extract the relevant part of the profile URL
function extractIdentifier(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(part => part);
        if (pathParts[0] && pathParts[1]) {
            return pathParts[1];
        }
    } catch (e) {
        return url.split('/').pop();
    }
    return null;
}

// Helper to convert array of objects to CSV string
function convertToCSV(data) {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  for (const row of data) {
    const values = headers.map(header => {
      const escaped = ('' + row[header]).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

// The main API function
export async function POST(request) {
  const { profileUrl } = await request.json();

  if (!STEAM_API_KEY) {
    return NextResponse.json({ message: 'Steam API key is not configured on the server.' }, { status: 500 });
  }

  // DEBUGGING: Log the last 4 characters of the key to verify it's loaded.
  console.log(`Server is using an API Key ending in: ...${STEAM_API_KEY.slice(-4)}`);

  if (!profileUrl) {
    return NextResponse.json({ message: 'Profile URL is required.' }, { status: 400 });
  }

  try {
    let steamId;
    const identifier = extractIdentifier(profileUrl);

    if (/^\d{17}$/.test(identifier)) {
      steamId = identifier;
    } else if (identifier) {
      const vanityResponse = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${identifier}`);
      const vanityData = await vanityResponse.json();
      
      if (vanityData.response.success !== 1) {
        return NextResponse.json({ message: 'Could not find a Steam ID for this profile URL.' }, { status: 404 });
      }
      steamId = vanityData.response.steamid;
    } else {
      return NextResponse.json({ message: 'Invalid Steam profile URL format.' }, { status: 400 });
    }

    const inventoryResponse = await fetch(`https://api.steampowered.com/IEconItems_730/GetPlayerItems/v1/?key=${STEAM_API_KEY}&steamid=${steamId}`);
    
    if (!inventoryResponse.ok) {
        // DEBUGGING: Log the status text from the failed response
        console.error(`Steam API responded with status: ${inventoryResponse.status} ${inventoryResponse.statusText}`);
        return NextResponse.json({ message: `Failed to fetch from the official Steam API. Status: ${inventoryResponse.status}` }, { status: 500 });
    }

    const inventoryData = await inventoryResponse.json();

    if (!inventoryData.result || inventoryData.result.status !== 1) {
        return NextResponse.json({ message: 'Inventory is private or the profile is invalid. (Checked with official API)' }, { status: 403 });
    }
    
    const items = inventoryData.result.items;

    if (!items || items.length === 0) {
      return NextResponse.json({ message: 'This inventory is empty.' }, { status: 404 });
    }
    
    const itemsForCSV = items.map(item => {
        return {
            "Item_ID": item.id,
            "Original_ID": item.original_id,
            "Def_Index": item.defindex,
            "Level": item.level,
            "Quality": item.quality,
            "Quantity": item.quantity,
        };
    });

    const csvData = convertToCSV(itemsForCSV);
    const fileName = `cs2_inventory_basic_${steamId}.csv`;

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    // DEBUGGING: Log the full error to see the exact reason for the fetch failure.
    console.error('Full API Route Error:', error);
    return NextResponse.json({ message: 'An unexpected server error occurred.', errorDetails: error.message }, { status: 500 });
  }
}

