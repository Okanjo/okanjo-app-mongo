# Example Application Usage

This is an example for how you can use the MongoService and CrudService in your application.

Run like so, replacing your mongo host for your test server:
```sh
MONGO_HOST=192.168.99.100:27017 node docs/example-app/index.js
```

And you should see something similar to this:
```js
'Created doodad'
{ __v: 0,
  name: 'my doodad',
  key: 'doodad_local_8PodFwC6WDUob',
  status: 'active',
  _id: 
   ObjectID {
     _bsontype: 'ObjectID',
     id: Buffer [ 90, 15, 109, 237, 43, 241, 58, 67, 92, 22, 203, 161 ] },
  updated: null,
  created: 2017-11-17T23:17:01.813Z }
'Retrieved doodads'
[ { _id: 
     ObjectID {
       _bsontype: 'ObjectID',
       id: Buffer [ 90, 15, 109, 237, 43, 241, 58, 67, 92, 22, 203, 161 ] },
    name: 'my doodad',
    key: 'doodad_local_8PodFwC6WDUob',
    status: 'active',
    __v: 0,
    updated: null,
    created: 2017-11-17T23:17:01.813Z } ]
Done!
```