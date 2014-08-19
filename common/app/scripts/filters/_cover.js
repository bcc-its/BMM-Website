'use strict';

angular.module('bmmLibApp')
  .filter('_cover', [ '_api', function (_api) {
    return function (cover, type, id, antiCache) {

      if (typeof cover==='undefined' || cover===null || cover==='') {
        if (typeof type==='undefined') {
          cover = 'fallback_images/svg/person.svg';
        } else {
          switch(type) {
            case 'speech':
            case 'exegesis':
              cover='fallback_images/svg/speech.svg';
              break;
            case 'song':
            case 'singsong':
            case 'audiobook':
              cover='fallback_images/svg/song.svg';
              break;
            case 'video':
              cover='fallback_images/svg/video.svg';
              break;
            case 'contributor':
              cover='fallback_images/svg/person.svg';
              break;
            case 'album':
              cover='fallback_images/svg/album.svg';
              break;
            default:
              cover='fallback_images/svg/bmm.svg';
              break;
          }
        }
      } else if (typeof id!=='undefined') {
        var antiC;
        if (typeof antiCache==='undefined'||antiCache) {
          antiC = '?'+ Math.floor(Math.random() * 9000000) + 1000000;
        } else {
          antiC = '';
        }
        cover = _api.secureFile(_api.getserverUrli()+type+'/'+id+'/cover')+antiC;
      }

      return cover;
    };
  }]);