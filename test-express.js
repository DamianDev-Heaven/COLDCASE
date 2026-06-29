const express = require('express');
const app = express();
app.all('/api/simulation/*path', (req, res) => {
  res.json({ params: req.params, path: req.path });
});
app.listen(3333, () => console.log('Listening on 3333'));
