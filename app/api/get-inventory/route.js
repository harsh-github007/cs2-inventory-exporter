import { NextResponse } from 'next/server';

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const CS2_APP_ID = 730;

// Helper to extract the relevant part of the profile URL
function extractIdentifier(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(part => part);
        if (pathParts.length >= 2) {
            return pathParts[1];
        }
    } catch (e) {
        // Fallback for non-URL strings
        return url;
    }
    return null;
}

// Helper to convert array of objects to CSV string
function convertToCSV(data) {
  if (!data || data.length === 0) {
    return "";
  }
  const headers = Object.keys(data[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));

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

  if (!profileUrl) {
    return NextResponse.json({ message: 'Profile URL is required.' }, { status: 400 });
  }

  try {
    let steamId;
    const identifier = extractIdentifier(profileUrl);

    if (/^\d{17}$/.test(identifier)) {
      // It's a 64-bit SteamID
      steamId = identifier;
    } else if (identifier) {
      // It's a custom vanity URL
      const vanityResponse = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${identifier}`);
      const vanityData = await vanityResponse.json();
      
      if (vanityData.response.success !== 1) {
        return NextResponse.json({ message: 'Could not find a Steam ID for this profile URL.' }, { status: 404 });
      }
      steamId = vanityData.response.steamid;
    } else {
      return NextResponse.json({ message: 'Invalid Steam profile URL format.' }, { status: 400 });
    }

    // Fetch the inventory descriptions first for item names
    const inventoryResponse = await fetch(`https://steamcommunity.com/inventory/${steamId}/${CS2_APP_ID}/2?l=english&count=5000`);
    if (!inventoryResponse.ok) {
        return NextResponse.json({ message: 'Inventory is private or the profile is invalid.' }, { status: 403 });
    }

    const inventoryData = await inventoryResponse.json();
    if (!inventoryData || !inventoryData.assets || !inventoryData.descriptions) {
      return NextResponse.json({ message: 'Could not read inventory data. It might be empty or private.' }, { status: 404 });
    }

    // Create a lookup map for descriptions
    const descriptionMap = new Map();
    for (const desc of inventoryData.descriptions) {
      descriptionMap.set(`${desc.classid}_${desc.instanceid}`, desc);
    }
    
    const itemsForCSV = inventoryData.assets.map(asset => {
        const description = descriptionMap.get(`${asset.classid}_${asset.instanceid}`);
        return {
            "Item Name": description?.market_hash_name || "Unknown",
            "Type": description?.type || "Unknown",
            "Amount": asset.amount,
            "Tradable": description?.tradable ? "Yes" : "No",
            "Marketable": description?.marketable ? "Yes" : "No",
            "Class ID": asset.classid,
            "Instance ID": asset.instanceid,
            "Asset ID": asset.assetid,
        };
    });

    if (itemsForCSV.length === 0) {
        return NextResponse.json({ message: 'This inventory appears to be empty.' }, { status: 200 });
    }
    
    const csvData = convertToCSV(itemsForCSV);
    const fileName = `cs2_inventory_${steamId}.csv`;

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
