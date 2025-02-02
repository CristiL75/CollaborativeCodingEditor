const session = require("express-session");
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");

const { AutentificareCollection, AdreseCollection, FoodCollection,SuggestionsCollection } = require("./mongo.js");



const app = express();
const PORT = 5000;

const jwt = require('jsonwebtoken');

app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

function generateToken(user) {
    const payload = {
        id: user.id,
        username: user.name,
        userType: user.userType
    };
    const options = {
        expiresIn: '10d' 
    };
    return jwt.sign(payload, 'secret-key', options);
}

app.get("/", (req, res) => {
    res.render("autentificare");
});

app.get("/inregistrare", (req, res) => {
    res.render("inregistrare");
});

app.post("/inregistrare", async (req, res) => {
    const data = {
        email: req.body.email,
        name: req.body.username,
        userType: req.body.userType,
        password: req.body.password
    };

    console.log("Am primit datele:", data);

    try {
        if (!data.email || !data.name || !data.password) {
            return res.status(400).send("Missing required fields");
        }

        const existingUser = await AutentificareCollection.findOne({ name: data.name });

        if (existingUser) {
            return res.send("Username already in use");
        } else {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            data.password = hashedPassword;

            const newUser = await AutentificareCollection.create(data);
            console.log("User data inserted:", newUser);
            const token = generateToken(newUser);

            return res.redirect("/");
        }
    } catch (error) {
        console.error("Error registering user:", error);
        return res.status(500).send("Error registering user");
    }
});

app.post("/autentificare", async (req, res) => {
    const { email, password } = req.body;

    try {
        const userData = await AutentificareCollection.findOne({ email });

        if (!userData) {
            return res.send("Username not found");
        }

        const isPasswordMatch = await bcrypt.compare(password, userData.password);

        if (isPasswordMatch) {
            req.session.username = userData.name;
            req.session.userType = userData.userType;
            const token = generateToken(userData);

            if (userData.userType === 'beneficiar') {
                res.redirect("/acasaBeneficiar?token=" + token);
            } else if (userData.userType === 'donator') {
                res.redirect("/acasaDonator?token=" + token);
            } else {
                res.send("Try again!");
            }
        } else {
            return res.send("Wrong password");
        }
    } catch (error) {
        console.error(error);
        return res.send("Error logging in");
    }
});

app.get("/acasaBeneficiar", (req, res) => {
    const userType = req.session.userType;
    res.render("acasaBeneficiar", { token: req.query.token, userType: userType });
});

app.get("/acasaDonator", (req, res) => {
    const userType = req.session.userType;
    if (!userType) {
        return res.send("UserType missing in session");
    }
    res.render("acasaDonator", { token: req.query.token, userType: userType });
});

app.get("/adresaDonatii", (req, res) => {
    res.render("adresaDonatii");
});

app.post("/salvareAdrese", async (req, res) => {
    const coordinates = req.body.coordinates;

    try {
        const adreseSalvate = await AdreseCollection.insertMany(coordinates);
        console.log("Adresele au fost salvate cu succes:", adreseSalvate);
        res.json({ message: "Adresele au fost salvate cu succes!" });
    } catch (error) {
        console.error("Eroare la salvarea adreselor:", error);
        res.status(500).json({ message: "Eroare la salvarea adreselor!" });
    }
});

app.get('/getCollectionPoints', async (req, res) => {
    try {
        const collectionPoints = await AdreseCollection.find({});
        const formattedCollectionPoints = collectionPoints.map(point => ({
            address: point.address,
            lat: point.latlng.lat,
            lng: point.latlng.lng
        }));
        res.json(formattedCollectionPoints);
    } catch (error) {
        console.error('Eroare la obtinerea punctelor de colectare:', error);
        res.status(500).json({ message: 'Eroare la obtinerea punctelor de colectare' });
    }
});

app.get('/getNeededFoods', async (req, res) => {
    try {
        const neededFoods = await FoodCollection.find({});
        res.json(neededFoods);
    } catch (error) {
        console.error('Eroare la obtinerea alimentelor necesare:', error);
        res.status(500).json({ message: 'Eroare la obtinerea alimentelor necesare' });
    }
});

app.post('/sendSuggestion', async (req, res) => {
    try {
        const { suggestion } = req.body;
        if (!suggestion) {
            return res.status(400).json({ message: 'Sugestia lipsește' });
        }
        const newSuggestion = await SuggestionsCollection.create({ suggestion });
        console.log('Sugestie salvată:', newSuggestion);
        res.json({ message: 'Sugestia a fost trimisă și salvată cu succes!' });
    } catch (error) {
        console.error('Eroare la trimiterea sugestiei:', error);
        res.status(500).json({ message: 'Eroare la trimiterea sugestiei' });
    }
});

app.get('/getSuggestions', async (req, res) => {
    try {
        const suggestions = await SuggestionsCollection.find({ status: 'pending' }); // Selectează doar sugestiile cu statusul 'pending'
        res.json(suggestions);
    } catch (error) {
        console.error('Eroare la obținerea sugestiilor:', error);
        res.status(500).json({ message: 'Eroare la obținerea sugestiilor' });
    }
});


app.post('/acceptSuggestion', async (req, res) => {
    try {
        const { suggestionId, suggestion } = req.body;

        if (!suggestionId || !suggestion) {
            return res.status(400).json({ message: 'SuggestionId și suggestion sunt necesare.' });
        }
        
        // Actualizează statusul sugestiei la 'accepted' și adaugă alimentul la lista de alimente donate
        const updatedSuggestion = await SuggestionsCollection.findByIdAndUpdate(
            suggestionId,
            { 
                status: 'accepted',
                $addToSet: { foods: suggestion } // Adaugă alimentul la lista de alimente donate
            },
            { new: true }
        );
        
        res.json({ message: 'Sugestia a fost acceptată și alimentul a fost adăugat la lista de alimente donate!', suggestion: updatedSuggestion });
    } catch (error) {
        console.error('Eroare la acceptarea sugestiei:', error);
        res.status(500).json({ message: 'Eroare la acceptarea sugestiei' });
    }
});



app.post('/rejectSuggestion', async (req, res) => {
    try {
        const { suggestionId } = req.body;
        const updatedSuggestion = await SuggestionsCollection.findByIdAndUpdate(
            suggestionId,
            { status: 'rejected' }, // Actualizează statusul sugestiei la 'rejected'
            { new: true }
        );
        res.json({ message: 'Sugestia a fost respinsă!', suggestion: updatedSuggestion });
    } catch (error) {
        console.error('Eroare la respingerea sugestiei:', error);
        res.status(500).json({ message: 'Eroare la respingerea sugestiei' });
    }
});

app.post("/salvareAlimente", async (req, res) => {
    const foods = req.body.foods;

    try {
        const insertedFoods = await FoodCollection.insertMany(foods.map(food => ({ food: food })));
        console.log("Alimentele au fost salvate cu succes:", insertedFoods);
        res.json({ message: "Alimentele au fost salvate cu succes!" });
    } catch (error) {
        console.error("Eroare la salvarea alimentelor:", error);
        res.status(500).json({ message: "Eroare la salvarea alimentelor!" });
    }
});

app.post('/removeNeededFood', async (req, res) => {
    try {
        const removedFood = req.body.food;
        console.log('Alimentul primit pentru ștergere:', removedFood);
        // Căutăm în baza de date și ștergem toate alimentele cu numele primit
        const result = await FoodCollection.deleteMany({ food: removedFood });
        if (result.deletedCount > 0) {
            res.json({ message: 'Alimentele au fost șterse din lista de alimente necesare' });
        } else {
            res.status(404).json({ message: 'Alimentul nu a fost găsit în lista de alimente necesare' });
        }
    } catch (error) {
        console.error('Eroare la ștergerea alimentului din lista de alimente necesare:', error);
        res.status(500).json({ message: 'Eroare la ștergerea alimentului din lista de alimente necesare' });
    }
});




app.get('/getFoodList', async (req, res) => {
    try {
        const foods = await FoodCollection.find({});
        res.json({ foods });
    } catch (error) {
        console.error('Eroare la obținerea listei de alimente:', error);
        res.status(500).json({ message: 'Eroare la obținerea listei de alimente' });
    }
});



const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server running on Port: ${port}`);
});
