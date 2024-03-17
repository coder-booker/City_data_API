const express = require('express');
const mongoose = require('mongoose');

const dbDomain = 'mongodb://mongodb/bigcities';
mongoose.connect(dbDomain, { useNewUrlParser: true, useUnifiedTopology: true })
    .then( () => {
        console.log('Connected to MongoDB');
    })
    .catch((error) => {
        console.error('Failed to connect to MongoDB:', error, ". Program will be terminated. ");
        process.exit(1);
    }
);

const Schema = mongoose.Schema;
const dataSchema = new Schema ({
    Name: String,
    'ASCII Name': String,
    'ISO Alpha-2': String,
    'ISO Name EN': String,
    Population: Number,
    Timezone: String,
    'Modification date': String,
    Coordinates: String
});
const collectionName = 'cities';
var the_model = mongoose.model(collectionName, dataSchema);

const app = express();
app.use(express.json());
app.use(express.urlencoded({extended: false}));

function constructCoors(mong_object) {
    const coors = mong_object.Coordinates.split(", ");
    mong_object.Coordinates = {lat: coors[0], lng: coors[1]};

    return mong_object;
}


app.get('/cities/v1/all', (req, res) => {
    let mongo_query = {};
    let sort = {};

    const pams = req.query;

    if ( Object.keys(pams).length === 0 ) {
        sort._id = 1;
    } else {
        mongo_query = { Population: {} };
        sort.Population = -1;

        if ( pams.hasOwnProperty("gte") ) {
            mongo_query.Population.$gte = pams.gte;
        }
        if ( pams.hasOwnProperty("lte") ) {
            mongo_query.Population.$lte = pams.lte;
        }
    }
    the_model.find(mongo_query)
    .sort( sort )
    .lean()
    .then( (result) => {
        if ( result.length == 0 ) {
            res.status(404).json({ 'error': "No record for this population range" });
        } else {
            let new_result = result.map( constructCoors );
            console.log(new_result);
            res.status(200).json(new_result);
        }
    })
    .catch( (error) => {
        res.status(500).json({ 'error': error.message });
    });
});



app.get('/cities/v1/alpha', (req, res) => {
    
    the_model.aggregate([
        {
            $group: {
                _id: "$ISO Alpha-2",
                'ISO Name EN': { $first: "$ISO Name EN" }
            }
        },
        {
            $project: {
                _id: 0,
                code: "$_id",
                name: "$ISO Name EN"
            }
        }
    ])
    // .limit(5)
    .sort( {'code': 1} )
    .then( (result) => {
        res.json(result);
    })
    .catch( (error) => {
        res.status(500).json({ error: 'Failed to retrieve data from database'+error });
    });
});

app.get('/cities/v1/alpha/:code', (req, res) => {

    the_model.aggregate([
        {
            $match: {'ISO Alpha-2': req.params.code}
        },
        {
            $project: {
                _id: 0,
                "ASCII Name": 1,
                Population: 1,
                Timezone: 1,
                Coordinates: 1,
                
            }
        }
    ])
    .sort( {Population: -1} )
    .then( (result) => {
        if ( result.length == 0 ) {
            res.status(404).json({ 'error': "No record for this alpha code" });
        } else {
            let new_result = result.map( constructCoors );
            console.log(new_result);
            res.status(200).json(new_result);
        }
    })
    .catch( (error) => {
        res.status(500).json({ 'error': error.message });
    });
});



app.get('/cities/v1/region', (req, res) => {

    the_model.aggregate([
        {
            $group: {
                _id: "$Timezone",
            }
        },
        {
            $project: {
                _id: 0,
                region: "$_id",
            }
        }
    ])
    .sort( {region: 1} )
    .then( (result) => {
        let new_result = result.map( (element) => {
            element = element.region.split("/")[0];
            
            return element;
        } );
        new_result = [...new Set(new_result)].sort();
        res.json(new_result);
    })
    .catch( (error) => {
        res.status(500).json({ 'error': error.message });
    });
});

app.get('/cities/v1/region/:region', (req, res) => {

    the_model.aggregate([
        {
            $match: {'Timezone': {$regex: req.params.region}}
        },
        {
            $project: {
                _id: 0,
                "ASCII Name": 1,
                'ISO Alpha-2': 1,
                "ISO Name EN": 1,
                Population: 1,
                Timezone: 1,
                Coordinates: 1,
            }
        }
    ])
    .sort( {Population: -1} )
    .then( (result) => {
        if ( result.length == 0 ) {
            res.status(404).json({ 'error': "No record for this region" });
        } else {
            let new_result = result.map( constructCoors );
            res.status(200).json(new_result);
        }
    })
    .catch( (error) => {
        res.status(500).json({ 'error': error.message });
    });
});




app.get('/cities/v1/:city', (req, res) => {

    let mongo_query = {};
    let sort = {};

    const city = req.params.city;
    const q_pams = req.query;
    let part = (q_pams.partial === "true");

    // default query
    mongo_query["ASCII Name"] = part ? {$regex: city} : city;

    // alpha query
    if ( q_pams.hasOwnProperty("alpha") ) {
        mongo_query['ISO Alpha-2'] = part ? {$regex: q_pams.alpha} : q_pams.alpha;
    } else {
    // region query
        if ( q_pams.hasOwnProperty("region") ) {
            mongo_query['Timezone'] = part ? {$regex: q_pams.region} : q_pams.region;
        }
    }

    // sort
    sort._id = 1; //defaut sort
    if ( q_pams.hasOwnProperty("sort") ) {
        if ( q_pams.sort === "alpha" ) {
            sort['ISO Alpha-2'] = 1;
        } else if ( q_pams.sort === "population" ) {
            sort.Population = -1;
        }
    }

    the_model.aggregate([
        {
            $match: mongo_query
        },
        {
            $project: {
                _id: 0,
                "ASCII Name": 1,
                'ISO Alpha-2': 1,
                "ISO Name EN": 1,
                Population: 1,
                Timezone: 1,
                Coordinates: 1,
            }
        }
    ])
    .sort( sort )
    .then( (result) => {
        if ( result.length == 0 ) {
            res.status(404).json({ 'error': "No record for this city name" });
        } else {
            let new_result = result.map( constructCoors );
            res.status(200).json(new_result);
        }
    })
    .catch( (error) => {
        res.status(500).json({ 'error': error.message });
    });
});

// unhandled path handler
app.use( (req, res) => {
    console.log("Path cannot found");
    res.status(400).json({'error': `Cannot ${req.method} ${req.originalUrl}`});
})

// error handler
app.use( (err, req, res, next) => {
    console.error('Failed to connect to MongoDB:', err, ". \nProgram will be terminated. ");
    process.exit(1);
})

const port = 3000;
app.listen(port, () => {
    console.log('Weather app listening on port 8000!')
});
