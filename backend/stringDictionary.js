const columnHeaderDictionary = {
    'sensor_reading_id':'Reading ID' ,
    'action_type':'Action' ,
    'action_date':'Date',
    'plants_plant_id':'Plant' ,
    'location_id': 'Location ID',
    'name' : 'Name', 
    'is_indoors': 'Is Indoors',
    'light_category': 'Light Category',
    'plant_id': 'Plant ID', 
    'date_added': 'Date Added',
    'date_time': 'Timestamp',
    'value': 'Value',
    'sensor_id': 'Sensor ID' ,
    'sensor_type': 'Sensor Type',
    'data_units': 'Units', 
    'status' : 'Status',
    'update_id': 'Update ID',
    'health_score' : 'Health Score',
    'comment': 'Comment',
    'update_date': 'Date',
    'plants_plant_id': 'Plant ID',
    'sensors_sensor_id': 'Sensor ID',
    "image_location":'Image Location',
};

export function getColumnHeaderDictionary()
{
    return columnHeaderDictionary;
}


export function buildCustomDictionary(columnStrings )
{
    let stringHeaders = {};
    for (const columnString in columnStrings)
        {
            stringHeaders[columnString] = getColumnHeader(columnString);
        }
        return stringHeaders;
}


function getColumnHeader(stringColumnHeader)
{
    if (stringColumnHeader in columnHeaderDictionary)
    {
            return columnHeaderDictionary[stringColumnHeader];
    }
    let words = stringColumnHeader.toString().split(" ");
    for (const word in words)
    {
        word[0].toUpperCase();
    }
    return words.join(" ");
}
