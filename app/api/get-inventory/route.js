import { NextResponse } from 'next/server';

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const CS2_APP_ID = 730;

// --- NEW, MORE ROBUST HELPER FUNCTION ---
// This function is specifically designed to correctly find the Steam ID
// from various URL formats, including the one you provided.
function extractIdentifier(url) {
    try {
        // Clean up URL to handle variations like trailing slashes
        const cleanUrl = url.trim().replace(/\/$/, '');
        const parts = cleanUrl.split('/');
        
        // Find the keyword 'profiles' or 'id' and get the next part of the URL
        const profilesIndex = parts.indexOf('profiles');
        if (profilesIndex !== -1 && parts.length > profilesIndex + 1) {
            return parts[profilesIndex + 1];
        }
        
        const idIndex = parts.indexOf('id');
        if (idIndex !== -1 && parts.length > idIndex + 1) {
            return parts[idIndex + 1];
        }

        // Fallback for simple vanity names or IDs
        if(parts.length > 0) {
            return parts[parts.length - 1];
        }
    } catch (e) {
        console.error("URL parsing failed:", e);
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
      const escaped = ('' + row[header]).replace(/"/g, '""'); // Escapes double quotes
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

    console.log(`Extracted Identifier: ${identifier}`); // Log what was extracted

    if (!identifier) {
        return NextResponse.json({ message: 'Could not extract a valid identifier from the URL.' }, { status: 400 });
    }

    if (/^\d{17}$/.test(identifier)) {
      steamId = identifier;
    } else {
      const vanityResponse = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${identifier}`);
      const vanityData = await vanityResponse.json();
      
      if (vanityData.response.success !== 1) {
        return NextResponse.json({ message: 'Could not find a Steam ID for this profile URL.' }, { status: 404 });
      }
      steamId = vanityData.response.steamid;
    }
    
    console.log(`Resolved SteamID: ${steamId}`); // Log the final ID

    const inventoryUrl = `https://steamcommunity.com/inventory/${steamId}/${CS2_APP_ID}/2?l=english&count=5000`;
    
    console.log(`Requesting inventory URL: ${inventoryUrl}`);

    const inventoryResponse = await fetch(inventoryUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        }
    });

    if (!inventoryResponse.ok) {
        console.error(`Steam Community API responded with status: ${inventoryResponse.status} ${inventoryResponse.statusText}`);
        return NextResponse.json({ message: `Inventory is private or profile is invalid. Status: ${inventoryResponse.status}` }, { status: 403 });
    }

    const inventoryData = await inventoryResponse.json();
    
    if (!inventoryData || !inventoryData.assets || !inventoryData.descriptions) {
      return NextResponse.json({ message: 'Could not read inventory data. It might be empty or there is a temporary Steam API issue.' }, { status: 404 });
    }
    
    if (inventoryData.assets.length === 0) {
      return NextResponse.json({ message: 'This inventory is empty.' }, { status: 404 });
    }

    const descriptionMap = new Map(inventoryData.descriptions.map(desc => [`${desc.classid}_${desc.instanceid}`, desc]));
    
    const itemsForCSV = inventoryData.assets.map(asset => {
        const description = descriptionMap.get(`${asset.classid}_${asset.instanceid}`);
        return {
            "Item_Name": description?.market_hash_name || "Unknown Item",
            "Type": description?.type || "Unknown",
            "Tradable": description?.tradable ? "Yes" : "No",
            "Marketable": description?.marketable ? "Yes" : "No",
            "Class_ID": asset.classid,
            "Instance_ID": asset.instanceid,
            "Asset_ID": asset.assetid,
        };
    });
    
    const csvData = convertToCSV(itemsForCSV);
    const fileName = `cs2_inventory_${steamId}.csv`;

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('Full API Route Error:', error);
    return NextResponse.json({ message: 'An unexpected server error occurred.', errorDetails: error.message }, { status: 500 });
  }
}

